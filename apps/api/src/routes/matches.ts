import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import {
  findFaceitAccountByUserId,
  getMatchByFaceitId,
  listMatchesForUser,
  syncFaceitPlayerHistory,
  updateFaceitAccountPlayerId,
} from '@cs2coach/database';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

async function userOwnsMatch(config: AppConfig, userId: string, matchId: string): Promise<boolean> {
  const [row] = await config.db`
    SELECT 1 FROM match_players mp
    JOIN players p ON p.id = mp.player_id
    JOIN faceit_accounts fa ON fa.faceit_user_id = p.faceit_player_id
    WHERE mp.match_id = ${matchId} AND fa.user_id = ${userId}
    LIMIT 1
  `;
  return Boolean(row);
}

export async function matchesRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/api/matches', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    let liveHistory: Array<{ id: string; faceitMatchId: string; map: string | null; status: string; score: { a: number; b: number }; startedAt: string | null; finishedAt: string | null }> = [];
    if (account?.faceitUserId) {
      try {
        const player = await config.faceitClient.resolvePlayer(account.faceitUserId, account.nickname, 'cs2');
        if (player.player_id !== account.faceitUserId) await updateFaceitAccountPlayerId(config.db, user.userId, player.player_id);
        const history = await config.faceitClient.getPlayerMatches(player.player_id, { offset: 0, limit: 20 });
        const items = history.items ?? [];
        liveHistory = items.map((m) => ({ id: `faceit-${m.match_id}`, faceitMatchId: m.match_id, map: m.details?.map ?? null, status: m.status ?? 'finished', score: { a: m.results?.score?.faction1 ?? 0, b: m.results?.score?.faction2 ?? 0 }, startedAt: m.started_at ? new Date(m.started_at * 1000).toISOString() : null, finishedAt: m.finished_at ? new Date(m.finished_at * 1000).toISOString() : null }));
        await syncFaceitPlayerHistory(config.db, { faceitPlayerId: player.player_id, nickname: player.nickname || account.nickname, avatar: player.avatar ?? account.avatar, country: player.country ?? account.country, skillLevel: player.games?.cs2?.skill_level ?? account.skillLevel, elo: player.games?.cs2?.faceit_elo ?? account.elo, items });
        config.logger.info('faceit_history_synced', { userId: user.userId, matchCount: items.length });
      } catch (error) { config.logger.warn('faceit_history_sync_failed', { userId: user.userId, faceitUserId: account.faceitUserId, error: error instanceof Error ? error.message : String(error) }); }
    }
    const dbMatches = await listMatchesForUser(config.db, { userId: user.userId, limit: 30 });
    const dbResult = dbMatches.map((m) => ({ id: m.id, faceitMatchId: m.faceitMatchId, map: m.map, status: m.status, score: { a: m.scoreA ?? 0, b: m.scoreB ?? 0 }, startedAt: m.startedAt, finishedAt: m.finishedAt }));
    const seen = new Set(dbResult.map((m) => m.faceitMatchId));
    return reply.send({ ok: true, data: [...dbResult, ...liveHistory.filter((m) => !seen.has(m.faceitMatchId))].slice(0, 30) });
  });

  app.get('/api/matches/:faceitMatchId', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId = (request.params as { faceitMatchId: string }).faceitMatchId;
    const user = request.authedUser!;
    const match = await getMatchByFaceitId(config.db, faceitMatchId);
    if (match) {
      if (!(await userOwnsMatch(config, user.userId, match.id))) throw new AppError(codes.notFound, 'Match not found', 404);
      const state = config.matchStateEngine.getState(match.id);
      return reply.send({ ok: true, data: { id: match.id, faceitMatchId: match.faceitMatchId, map: match.map ?? state?.map ?? null, status: match.status, score: { a: match.scoreA ?? 0, b: match.scoreB ?? 0 }, live: state ?? null } });
    }
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    if (!account?.faceitUserId) throw new AppError(codes.notFound, 'Match not found', 404);
    try {
      const detail = await config.faceitClient.getMatchById(faceitMatchId);
      const roster1 = detail.teams?.faction1?.roster ?? [];
      const roster2 = detail.teams?.faction2?.roster ?? [];
      if (![...roster1, ...roster2].some((p: any) => p.player_id === account.faceitUserId)) throw new Error('match is not owned by current user');
      return reply.send({ ok: true, data: { id: `faceit-${detail.match_id}`, faceitMatchId: detail.match_id, map: detail.details?.map ?? null, status: detail.status ?? 'finished', score: { a: detail.results?.score?.faction1 ?? 0, b: detail.results?.score?.faction2 ?? 0 }, live: null } });
    } catch { throw new AppError(codes.notFound, 'Match not found', 404); }
  });

  app.post('/api/matches/:faceitMatchId/coach', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId = (request.params as { faceitMatchId: string }).faceitMatchId;
    const user = request.authedUser!;
    const match = await getMatchByFaceitId(config.db, faceitMatchId);
    if (!match || !(await userOwnsMatch(config, user.userId, match.id))) throw new AppError(codes.notFound, 'Match not found', 404);
    const state = config.matchStateEngine.getState(match.id);
    if (!state || !state.gameDataAvailable) throw new AppError(codes.waitingForGameData, 'Waiting for live game data', 202);
    const decision = await config.aiCoordinator.requestDecision(match.id, state, 'A');
    return reply.send({ ok: true, data: decision });
  });
}
