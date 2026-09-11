/**
 * Game-state ingestion (spec §24): POST /api/game-state/events accepts
 * NORMALIZED events ONLY from an authorized real source (a future CS2 GSI
 * bridge) or from an explicitly-authorized demo stream. This is the seam a
 * future realtime provider slots into — it never manufactures data itself.
 */
import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import { normalizeExternalGameEvent } from '@cs2coach/game-state';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

export async function gameStateRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  // Single event
  app.post('/api/game-state/events', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const body = request.body as { events?: unknown[] } | unknown;

    let rawList: unknown[];
    if (Array.isArray(body)) rawList = body;
    else if (typeof body === 'object' && body !== null && Array.isArray((body as { events?: unknown[] }).events)) {
      rawList = (body as { events: unknown[] }).events;
    } else {
      rawList = [body];
    }

    const accepted: string[] = [];
    let failed = 0;
    for (const raw of rawList) {
      const result = normalizeExternalGameEvent(raw);
      if (result.ok) {
        config.matchStateEngine.applyEvent(result.event);
        accepted.push(result.event.type);
      } else {
        failed += 1;
      }
    }

    // Only surface a rejection for wholesale invalid payloads.
    if (accepted.length === 0 && failed > 0) {
      throw new AppError(codes.badRequest, 'No valid game events in payload', 400);
    }

    config.aiCoordinator.processNext();
    return reply.send({ ok: true, data: { accepted, rejected: failed } });
  });
}