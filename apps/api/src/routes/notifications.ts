import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { AppError, codes } from '@cs2coach/shared';
import {
  createTelegramLinkToken,
  getNotificationTarget,
  setNotificationsEnabled,
  setUserLocale,
  unlinkTelegram,
} from '@cs2coach/database';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';
import { getBotUsername, normalizeLocale } from '../notify';

const LINK_TTL_MS = 15 * 60_000;

export async function notificationRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  const auth = await requireAuth(config);

  const status = async (userId: string) => {
    const target = await getNotificationTarget(config.db, userId);
    if (!target) throw new AppError(codes.unauthorized, 'User not found', 401);
    return {
      telegram: {
        available: Boolean(config.env.telegramBotToken),
        linked: target.telegramChatId != null,
        username: target.telegramUsername,
        linkedAt: target.telegramLinkedAt?.toISOString() ?? null,
      },
      enabled: target.notificationsEnabled,
      locale: normalizeLocale(target.locale),
    };
  };

  app.get('/api/notifications', { preHandler: auth }, async (request, reply) => {
    return reply.send({ ok: true, data: await status(request.authedUser!.userId) });
  });

  app.post('/api/notifications/settings', { preHandler: auth }, async (request, reply) => {
    const userId = request.authedUser!.userId;
    const body = (request.body ?? {}) as { enabled?: unknown; locale?: unknown };
    if (typeof body.enabled === 'boolean') await setNotificationsEnabled(config.db, userId, body.enabled);
    if (typeof body.locale === 'string') await setUserLocale(config.db, userId, normalizeLocale(body.locale));
    return reply.send({ ok: true, data: await status(userId) });
  });

  app.post('/api/notifications/telegram/link', { preHandler: auth }, async (request, reply) => {
    const userId = request.authedUser!.userId;
    if (!config.env.telegramBotToken) throw new AppError(codes.missingEnv, 'TELEGRAM_BOT_TOKEN is not configured', 503);
    const botUsername = await getBotUsername(config);
    if (!botUsername) throw new AppError(codes.missingEnv, 'Telegram bot username is unavailable', 503);
    const body = (request.body ?? {}) as { locale?: unknown };
    if (typeof body.locale === 'string') await setUserLocale(config.db, userId, normalizeLocale(body.locale));
    // Telegram deep-link payloads allow [A-Za-z0-9_-]{1,64}.
    const token = randomBytes(24).toString('base64url');
    const expiresAt = await createTelegramLinkToken(config.db, { userId, token, ttlMs: LINK_TTL_MS });
    return reply.send({ ok: true, data: { url: `https://t.me/${botUsername}?start=link_${token}`, expiresAt: expiresAt.toISOString() } });
  });

  app.post('/api/notifications/telegram/unlink', { preHandler: auth }, async (request, reply) => {
    const userId = request.authedUser!.userId;
    await unlinkTelegram(config.db, userId);
    return reply.send({ ok: true, data: await status(userId) });
  });
}
