import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import { findFaceitAccountByUserId, getMatchByFaceitId } from '@cs2coach/database';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';
import { userOwnsMatch } from './matches';
import { syncFaceitPlayerMatchStats } from '../utils/faceit-stats';

export async function matchStatsRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/api/matches/:faceitMatchId/stats', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId = (request.params as { faceitMatchId: string }).faceitMatchId;
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    const match = await getMatchByFaceitId(config.db, faceitMatchId);
    if (!match || !account || !(await userOwnsMatch(config, user.userId, match.id))) throw new AppError(codes.notFound, 'Match not found', 404);

    const loadRows = async () => config.db`
      SELECT mp.player_id AS player_id,p.nickname,p.faceit_player_id,p.avatar,p.skill_level,p.elo,mp.team,
        COALESCE(ps.kills,mp.kills,0) kills,COALESCE(ps.deaths,mp.deaths,0) deaths,COALESCE(ps.assists,mp.assists,0) assists,
        ps.adr,ps.kast,ps.rating,COALESCE(ps.opening_kills,0) opening_kills,COALESCE(ps.opening_deaths,0) opening_deaths,
        COALESCE(ps.utility_damage,0) utility_damage,COALESCE(ps.flash_assists,0) flash_assists,COALESCE(ps.clutches,0) clutches,
        COALESCE(ps.headshots,0) headshots,ps.headshots_percent,COALESCE(ps.total_damage,0) total_damage,COALESCE(ps.mvps,0) mvps,
        COALESCE(ps.triple_kills,0) triple_kills,COALESCE(ps.quadro_kills,0) quadro_kills,COALESCE(ps.ace_kills,0) ace_kills
      FROM match_players mp JOIN players p ON p.id=mp.player_id
      LEFT JOIN player_statistics ps ON ps.match_id=mp.match_id AND ps.player_id=mp.player_id
      WHERE mp.match_id=${match.id} ORDER BY ps.rating DESC NULLS LAST,ps.kills DESC`;

    let synced = false;
    const existingRows = (await loadRows()) as Array<Record<string, unknown>>;
    const mineBefore = existingRows.find((r) => r.faceit_player_id === account.faceitUserId) ?? null;
    if (mineBefore) {
      try {
        const fresh = await syncFaceitPlayerMatchStats(config, match.id, String(mineBefore.player_id), account.faceitUserId, faceitMatchId);
        synced = Boolean(fresh);
        if (synced) await config.db`DELETE FROM match_analysis WHERE match_id=${match.id}`;
      } catch (error) {
        config.logger.warn('faceit_match_stats_sync_failed', { faceitMatchId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const playerRows = (await loadRows()) as Array<Record<string, unknown>>;
    const mine = playerRows.find((r) => r.faceit_player_id === account.faceitUserId) ?? null;
    return reply.send({ ok: true, data: {
      matchId: faceitMatchId,
      score: { a: match.scoreA, b: match.scoreB },
      status: match.status,
      map: match.map ?? null,
      player: mine,
      players: playerRows,
      statsSource: synced ? 'faceit-match' : 'database-cache',
    }});
  });
}
