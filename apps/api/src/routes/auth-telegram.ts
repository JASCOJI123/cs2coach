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

/**
 * Telegram initData fields we consume. The authoritative user identity lives
 * inside the URL-encoded `user` JSON object, not as a top-level parameter.
 */
interface InitDataRecord {
  id: string;
  first_name?: string;
  username?: string;
  auth_date: string;
  hash: string;
}

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
    if (!/^\d+$/.test(parsed.id)) {
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

/**
 * Parse Telegram initData. The numeric user id and profile fields arrive as a
 * URL-encoded JSON blob under the `user` key, e.g.
 *   query_id=AAH...&user={"id":7080911448,"first_name":"Jasco"}&auth_date=...&hash=...
 */
export function parseInitData(initData: string): InitDataRecord | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const authDate = params.get('auth_date');
    const userRaw = params.get('user');
    if (!hash || !authDate || !userRaw) return null;
    const user = JSON.parse(userRaw) as Record<string, unknown>;
    const id = user.id;
    if (typeof id !== 'string' && typeof id !== 'number') return null;
    return {
      id: String(id),
      first_name: typeof user.first_name === 'string' ? user.first_name : undefined,
      username: typeof user.username === 'string' ? user.username : undefined,
      auth_date: authDate,
      hash,
    };
  } catch {
    return null;
  }
}

/**
 * Verify the initData signature per the Telegram WebApp algorithm
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 * sort all fields except `hash` alphabetically, join as `key=value` lines, then
 * HMAC-SHA256 with a secret derived from the bot token.
 */
export function verifyTelegramInitData(botToken: string, initData: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');
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