import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import { findFaceitAccountByUserId, getMatchByFaceitId } from '@cs2coach/database';
import { PostMatchAnalysisService } from '@cs2coach/ai';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';
import { userOwnsMatch } from './matches';

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export async function matchAnalysisRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/api/matches/:faceitMatchId/analysis', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId = (request.params as { faceitMatchId: string }).faceitMatchId;
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    const match = await getMatchByFaceitId(config.db, faceitMatchId);
    if (!match || !account || !(await userOwnsMatch(config, user.userId, match.id))) {
      throw new AppError(codes.notFound, 'Match not found', 404);
    }

    const [analysisRows] = await Promise.all([
      config.db`SELECT post_match_analysis, created_at, updated_at FROM match_analysis WHERE match_id = ${match.id} LIMIT 1`,
    ]);
    const saved = analysisRows[0] as { post_match_analysis: unknown } | undefined;
    if (!saved?.post_match_analysis) return reply.send({ ok: true, data: null });
    return reply.send({ ok: true, data: saved.post_match_analysis });
  });

  app.post('/api/matches/:faceitMatchId/analysis', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const faceitMatchId = (request.params as { faceitMatchId: string }).faceitMatchId;
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    const match = await getMatchByFaceitId(config.db, faceitMatchId);
    if (!match || !account || !(await userOwnsMatch(config, user.userId, match.id))) {
      throw new AppError(codes.notFound, 'Match not found', 404);
    }

    const [playerRows, roundRows, patternRows] = await Promise.all([
      config.db`
        SELECT p.nickname, mp.player_id,
               COALESCE(ps.kills, mp.kills, 0) AS kills,
               COALESCE(ps.deaths, mp.deaths, 0) AS deaths,
               COALESCE(ps.assists, mp.assists, 0) AS assists,
               COALESCE(ps.opening_kills, 0) AS opening_kills,
               COALESCE(ps.opening_deaths, 0) AS opening_deaths,
               COALESCE(ps.utility_damage, 0) AS utility_damage,
               COALESCE(ps.flash_assists, 0) AS flash_assists,
               COALESCE(ps.clutches, 0) AS clutches
        FROM match_players mp
        JOIN players p ON p.id = mp.player_id
        LEFT JOIN player_statistics ps ON ps.match_id = mp.match_id AND ps.player_id = mp.player_id
        JOIN faceit_accounts fa ON fa.faceit_user_id = p.faceit_player_id
        WHERE mp.match_id = ${match.id} AND fa.user_id = ${user.userId}
        LIMIT 1
      `,
      config.db`
        SELECT r.round_number, r.winner, r.side, r.win_reason, r.score_after_round,
          COALESCE(json_agg(json_build_object('eventType', e.event_type, 'weapon', e.weapon, 'damage', e.damage, 'metadata', e.metadata_json)) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS events
        FROM rounds r
        LEFT JOIN player_round_events e ON e.round_id = r.id
        WHERE r.match_id = ${match.id}
        GROUP BY r.id
        ORDER BY r.round_number ASC
      `,
      config.db`
        SELECT pattern_type, location, frequency, confidence, sample_size
        FROM opponent_patterns
        WHERE match_id = ${match.id}
        ORDER BY sample_size DESC, frequency DESC
        LIMIT 10
      `,
    ]);

    const player = playerRows[0] as Record<string, unknown> | undefined;
    if (!player) throw new AppError(codes.notFound, 'Player is not linked to this match', 404);

    const rounds = roundRows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        roundNumber: Number(r.round_number),
        winner: r.winner == null ? null : String(r.winner),
        side: r.side == null ? null : String(r.side),
        winReason: r.win_reason == null ? null : String(r.win_reason),
        scoreAfterRound: r.score_after_round == null ? null : String(r.score_after_round),
        playerEvents: (parseJson(r.events) as unknown[] | null) ?? [],
      };
    });

    const opponentPatterns = patternRows.map((row) => {
      const r = row as Record<string, unknown>;
      return `${String(r.pattern_type)}${r.location ? ` at ${String(r.location)}` : ''}: frequency ${Number(r.frequency).toFixed(1)}, confidence ${String(r.confidence)}, sample ${Number(r.sample_size)}`;
    });

    const service = new PostMatchAnalysisService(config.groqClient);
    const result = await service.generate({
      map: match.map ?? null,
      finalScore: { a: Number(match.scoreA ?? 0), b: Number(match.scoreB ?? 0) },
      player: {
        nickname: String(player.nickname),
        kills: Number(player.kills), deaths: Number(player.deaths), assists: Number(player.assists),
        openingKills: Number(player.opening_kills), openingDeaths: Number(player.opening_deaths),
        utilityDamage: Number(player.utility_damage), flashAssists: Number(player.flash_assists), clutches: Number(player.clutches),
      },
      rounds,
      opponentPatterns,
    });

    await config.db.begin(async (sql) => {
      await sql`
        INSERT INTO match_analysis (match_id, post_match_analysis)
        VALUES (${match.id}, ${sql.json(result.analysis)})
        ON CONFLICT (match_id) DO UPDATE SET post_match_analysis = EXCLUDED.post_match_analysis, updated_at = now()
      `;
      await sql`
        INSERT INTO training_plans (user_id, match_id, plan_json)
        VALUES (${user.userId}, ${match.id}, ${sql.json(result.analysis.trainingPlan)})
        ON CONFLICT (user_id, match_id) DO UPDATE SET plan_json = EXCLUDED.plan_json
      `;
    });

    return reply.send({ ok: true, data: { ...result.analysis, source: result.source } });
  });
}
