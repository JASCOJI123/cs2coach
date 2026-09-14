/**
 * Health + FACEIT webhook receiver routes (spec §30, §37).
 */
import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import { isSupportedEvent, normalizeMatchPayload, verifyWebhookSignature, webhookToGameEvents } from '@cs2coach/faceit';
import type { AppConfig } from '../config';

function safeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgres://[redacted]')
    .replace(/password[=:][^\s,}]+/gi, 'password=[redacted]')
    .slice(0, 300);
}

export async function healthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return reply.send({ ok: true, data: { status: 'ok', uptime: 0 } });
  });
  app.get('/api/health', async (_request, reply) => {
    let dbOk = false;
    let dbError: string | undefined;
    try {
      await config.db`select true as ok`;
      dbOk = true;
    } catch (error) {
      dbError = safeDbError(error);
    }
    return reply.send({ ok: true, data: { dbOk, dbError, uptime: 0 } });
  });

  // POST /api/webhook/faceit — FACEIT webhook receiver
  app.post('/api/webhook/faceit', async (request, reply) => {
    const raw = request.body;
    if (typeof raw !== 'object' || raw === null) {
      throw new AppError(codes.badRequest, 'Webhook body must be a JSON object', 400);
    }
    const payload = raw as Record<string, unknown>;

    const eventType = typeof payload.event === 'string' ? payload.event : '';
    if (!isSupportedEvent(eventType)) {
      return reply.send({ ok: true, data: { ignored: true, reason: `unsupported event: ${eventType}` } });
    }

    if (config.env.faceitWebhookSecret) {
      const signature = String(request.headers['x-hub-signature-256'] ?? '');
      const body = JSON.stringify(payload);
      if (!verifyWebhookSignature(body, signature, { secret: config.env.faceitWebhookSecret })) {
        throw new AppError(codes.forbidden, 'Invalid webhook signature', 401);
      }
    }

    const normalized = normalizeMatchPayload(payload);
    const events = webhookToGameEvents(eventType, normalized);
    for (const event of events) config.matchStateEngine.applyEvent(event);

    config.aiCoordinator.processNext();
    return reply.send({ ok: true, data: { accepted: true, events: events.map((e) => e.type) } });
  });
}