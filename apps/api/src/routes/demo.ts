/**
 * Demo trigger route (spec §33): starts a synthetic demo stream ONLY when
 * DEMO_MODE=true and production is off. In any production environment this
 * 404s — the app must never show fabricated data as live.
 */
import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

export async function demoRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  // POST /api/demo/start — inject a demo match stream
  app.post('/api/demo/start', { preHandler: await requireAuth(config) }, async (_request, reply) => {
    if (!config.env.isDemoMode || !config.demoProvider) {
      throw new AppError(codes.demoUnavailable, 'Demo mode is disabled in this environment', 404);
    }
    const matchId = config.demoProvider.matchId ?? `demo-${Date.now().toString(36)}`;
    config.demoProvider.watchMatch(matchId, (events) => {
      for (const event of events) config.matchStateEngine.applyEvent(event);
      config.aiCoordinator.processNext();
    });
    return reply.send({ ok: true, data: { matchId, demoMode: true } });
  });
}