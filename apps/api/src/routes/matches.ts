/**
 * Matches routes (spec §9, §37): lists the user's recent matches, a single
 * match's detail + live state, and the live coach decision request.
 * Live data only ever comes from real FACEIT events or (dev-only) demo mode.
 */
import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import {
  findFaceitAccountByUserId,
  getMatchByFaceitId,
  listMatchesForUser,
  syncFaceitPlayerHistory,
} from '@cs2coach/database';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

export async function matchesRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  // GET /api/matches — list the user's matches
  app.get('/api/matches', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);

    // FACEIT history is the source of truth for recent matches. Keep the DB
    // list as the response source so existing match/live routes stay unchanged.
    if (account?.faceitUserId) {
      try {
        const history = await config.faceitClient.getPlayerMatches(account.faceitUserId, {
          offset: 0,
          limit: 20,
        });
        await syncFaceitPlayerHistory(config.db, {
          faceitPlayerId: account.faceitUserId,
          nickname: account.nickname,
          avatar: account.avatar,
          country: account.country,
          skillLevel: account.skillLevel,
          elo: account.elo,
          items: history.items ?? [],
        });
      } catch (error) {
        config.logger.warn('faceit_history_sync_failed', {
          userId: user.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const matches = await listMatchesForUser(config.db, { userId: user.userId, limit: 30 });
    return reply.send({
      ok: true,
      data: matches.map((m) => ({
        id: m.id,
        faceitMatchId: m.faceitMatchId,
        map: m.map,
        status: m.status,
        score: { a: m.scoreA ?? 0, b: m.scoreB ?? 0 },
        startedAt: m.startedAt,
        finishedAt: m.finishedAt,
      })),
    });
  });

  // GET /api/matches/:faceitMatchId — match detail + live coaching state
  app.get('/api/matches/:faceitMatchId', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId = (request.params as { faceitMatchId: string }).faceitMatchId;
    const match = await getMatchByFaceitId(config.db, faceitMatchId);
    if (!match) throw new AppError(codes.notFound, 'Match not found', 404);

    const state = config.matchStateEngine.getState(match.id);
    return reply.send({
      ok: true,
      data: {
        id: match.id,
        faceitMatchId: match.faceitMatchId,
        map: match.map ?? state?.map ?? null,
        status: match.status,
        score: { a: match.scoreA ?? 0, b: match.scoreB ?? 0 },
        live: state ?? null,
      },
    });
  });

  // POST /api/matches/:faceitMatchId/coach — request an AI decision for live state
  app.post('/api/matches/:faceitMatchId/coach', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId = (request.params as { faceitMatchId: string }).faceitMatchId;
    const match = await getMatchByFaceitId(config.db, faceitMatchId);
    if (!match) throw new AppError(codes.notFound, 'Match not found', 404);

    const state = config.matchStateEngine.getState(match.id);
    if (!state || !state.gameDataAvailable) {
      throw new AppError(codes.waitingForGameData, 'Waiting for live game data', 202);
    }

    const decision = await config.aiCoordinator.requestDecision(match.id, state, 'A');
    return reply.send({ ok: true, data: decision });
  });
}
