/**
 * POST /api/auth/telegram — validate Telegram Mini App initData (HMAC against
 * the bot token), then upsert the user and mint a short-lived session JWT.
 */
import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { AppError, codes } from '@cs2coach/shared';
import { upsertUser } from '@cs2coach/database';
import type { AppConfig } from '../config';

interface InitDataRecord {
  id: string;
  first_name?: string;
  username?: string;
  auth_date: string;
  hash: string;
}

const TELEGRAM_INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;

export async function telegramAuthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post('/api/auth/telegram', async (request, reply) => {
    const body = request.body as { initData?: string } | undefined;
    const initData = body?.initData;
    if (!initData) throw new AppError(codes.badRequest, 'initData is required', 400);

    const parsed = parseInitData(initData);
    if (!parsed || !/^\d+$/.test(parsed.id)) {
      throw new AppError(codes.invalidTelegramInitData, 'Invalid initData format', 400);
    }

    const authDate = Number(parsed.auth_date);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > TELEGRAM_INIT_DATA_MAX_AGE_SEC) {
      throw new AppError(codes.invalidTelegramInitData, 'Telegram initData has expired', 401);
    }

    const botToken = config.env.telegramBotToken;
    if (!botToken) {
      throw new AppError(codes.missingEnv, 'TELEGRAM_BOT_TOKEN is not configured', 503);
    }
    if (!verifyTelegramInitData(botToken, initData)) {
      throw new AppError(codes.invalidTelegramInitData, 'initData signature verification failed', 401);
    }

    const telegramId = Number(parsed.id);
    const user = await upsertUser(config.db, { telegramId, username: parsed.username ?? '' });
    if (!user) throw new AppError(codes.upstreamError, 'Failed to create user', 500);

    const token = config.signSession({ sub: user.id, telegramId });
    return reply.send({
      ok: true,
      data: {
        token,
        expiresAt: Date.now() + config.env.sessionTtlMs,
        user: { id: user.id, firstName: parsed.first_name ?? '', username: user.telegramUsername ?? '' },
        demoMode: config.env.isDemoMode,
      },
    });
  });
}

export function parseInitData(initData: string): InitDataRecord | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const authDate = params.get('auth_date');
    const userRaw = params.get('user');
    if (!hash || !authDate || !userRaw) return null;
    const user = JSON.parse(userRaw) as Record<string, unknown>;
    if (typeof user.id !== 'string' && typeof user.id !== 'number') return null;
    return {
      id: String(user.id),
      first_name: typeof user.first_name === 'string' ? user.first_name : undefined,
      username: typeof user.username === 'string' ? user.username : undefined,
      auth_date: authDate,
      hash,
    };
  } catch {
    return null;
  }
}

export function verifyTelegramInitData(botToken: string, initData: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return false;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');
    return timingSafeEqualHex(hash.toLowerCase(), expected);
  } catch {
    return false;
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
