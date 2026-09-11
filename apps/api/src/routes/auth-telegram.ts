/**
 * POST /api/auth/telegram — validate Telegram Mini App initData (HMAC against
 * the bot token) per spec §53, then upsert the user and mint a short-lived
 * session JWT to the web app.
 *
 * Also receives an optional Telegram `id` when provided for binding events.
 */
import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { AppError, codes } from '@cs2coach/shared';
import { upsertUser } from '@cs2coach/database';
import type { AppConfig } from '../config';

const INIT_DATA_ORDER = ['auth_date', 'first_name', 'hash', 'id', 'last_name', 'photo_url', 'query_id', 'username'];

type InitDataRecord = Record<string, string>;

export async function telegramAuthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post('/api/auth/telegram', async (request, reply) => {
    const body = request.body as { initData?: string } | undefined;
    const initData = body?.initData;
    if (!initData) {
      throw new AppError(codes.badRequest, 'initData is required', 400);
    }

    const parsed = parseInitData(initData);
    if (!parsed) {
      throw new AppError(codes.invalidTelegramInitData, 'Invalid initData format', 400);
    }
    if (typeof parsed.id !== 'string' || !/^\d+$/.test(parsed.id)) {
      throw new AppError(codes.invalidTelegramInitData, 'initData missing numeric id', 400);
    }

    const botToken = config.env.telegramBotToken;
    if (botToken && !verifyTelegramInitData(config.env.telegramBotToken ?? '', initData)) {
      throw new AppError(codes.invalidTelegramInitData, 'initData signature verification failed', 401);
    }

    const telegramId = Number(parsed.id);
    const firstName = parsed.first_name ?? '';
    const username = parsed.username ?? '';

    // Upsert the user
    const user = await upsertUser(config.db, { telegramId, username });
    if (!user) {
      throw new AppError(codes.upstreamError, 'Failed to create user', 500);
    }

    // Mint session JWT
    const token = config.signSession({ sub: user.id, telegramId });

    return reply.send({
      ok: true,
      data: {
        token,
        expiresAt: Date.now() + config.env.sessionTtlMs,
        user: { id: user.id, firstName, username: user.telegramUsername ?? '' },
        demoMode: config.env.isDemoMode,
      },
    });
  });
}

/** Parse Telegram initData fields and return a flat record. */
export function parseInitData(initData: string): InitDataRecord | null {
  try {
    const params = new URLSearchParams(initData);
    const record: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      if (typeof value === 'string') record[key] = value;
    }
    if (typeof record.hash !== 'string' || typeof record.auth_date !== 'string') {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

/** Verify the initData signature per the Telegram WebApp algorithm. */
export function verifyTelegramInitData(botToken: string, initData: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const fields: string[] = [];
    const hash = params.get('hash');
    if (!hash) return false;
    params.delete('hash');
    for (const key of INIT_DATA_ORDER) {
      const value = params.get(key);
      if (value !== null) fields.push(`${key}=${value}`);
    }
    // Deterministic join in fixed order
    const dataCheckString = fields.join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');
    return timingSafeEqualHex(hash, expected);
  } catch {
    return false;
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}