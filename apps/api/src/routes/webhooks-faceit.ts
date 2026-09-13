import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import { addMatchPlayer, findFaceitAccountByFaceitUserId, updateFaceitAccountProfile, upsertMatchFromFaceit, upsertPlayer } from '@cs2coach/database';
import { isSupportedEvent, normalizeMatchPayload, webhookToGameEvents } from '@cs2coach/faceit';
import type { FaceitFaction } from '@cs2coach/faceit';
import type { AppConfig } from '../config';

function headerValue(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function findMatchId(body: Record<string, unknown>): string | null {
  const payload = (body.payload ?? body.data ?? body) as Record<string, unknown> | undefined;
  const payloadMatch = payload?.match as Record<string, unknown> | undefined;
  const direct = [
    payload?.id,
    payload?.match_id,
    payload?.matchId,
    payloadMatch?.id,
    body.match_id,
    body.matchId,
  ];
  return direct.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
}
function rosterForFaction(faction: FaceitFaction): FaceitFaction['members'] { return faction.roster ?? faction.members; }

export async function faceitWebhookRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post('/api/webhooks/faceit', async (request, reply) => {
    const secret = config.env.faceitWebhookSecret;
    if (config.env.isProduction && !secret) throw new AppError(codes.missingEnv, 'FACEIT_WEBHOOK_SECRET is not configured', 503);
    if (secret) {
      const provided = headerValue(request.headers['x-faceit-webhook-secret']) ?? headerValue(request.headers['x-faceit-secret']);
      if (provided !== secret) throw new AppError(codes.unauthorized, 'Invalid FACEIT webhook authentication', 401);
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const event = typeof body.event === 'string' ? body.event : typeof body.event_type === 'string' ? body.event_type : '';
    if (!event) throw new AppError(codes.badRequest, 'FACEIT webhook missing event', 400);
    if (!isSupportedEvent(event)) return reply.send({ ok: true, ignored: true, event });
    const matchId = findMatchId(body);
    if (!matchId) throw new AppError(codes.badRequest, 'FACEIT webhook missing match_id', 400);

    const detail = await config.faceitClient.getMatchById(matchId);
    const normalized = normalizeMatchPayload(detail);
    const teams = Object.values(detail.teams ?? {}) as FaceitFaction[];
    const accountIds = new Set<string>();
    const payload = (body.payload ?? body.data) as Record<string, unknown> | undefined;
    for (const value of [payload?.user_id, payload?.player_id, body.user_id, body.player_id]) if (typeof value === 'string') accountIds.add(value);
    for (const faction of teams) for (const member of rosterForFaction(faction)) accountIds.add(member.player_id);

    let linkedAccount = null;
    for (const candidate of accountIds) {
      const account = await findFaceitAccountByFaceitUserId(config.db, candidate);
      if (account) { linkedAccount = account; break; }
    }
    if (!linkedAccount) {
      config.logger.info('faceit_webhook_ignored_unlinked_match', { event, matchId });
      return reply.send({ ok: true, ignored: true, reason: 'no linked CS2 Ustoz account', matchId });
    }

    const match = await upsertMatchFromFaceit(config.db, { faceitMatchId: detail.match_id, game: detail.game ?? 'cs2', competition: detail.competition_name ?? detail.competition_id ?? null, map: detail.details?.map ?? null, status: normalized.status, startedAtMs: detail.started_at ? detail.started_at * 1000 : null, finishedAtMs: detail.finished_at ? detail.finished_at * 1000 : null, scoreA: detail.results?.score?.faction1 ?? 0, scoreB: detail.results?.score?.faction2 ?? 0 });
    for (let index = 0; index < teams.length; index += 1) {
      const faction = teams[index];
      if (!faction) continue;
      for (const member of rosterForFaction(faction)) {
        const player = await upsertPlayer(config.db, { faceitPlayerId: member.player_id, nickname: member.nickname, avatar: member.avatar, skillLevel: member.skill_level });
        await addMatchPlayer(config.db, { matchId: match.id, playerId: player.id, team: index === 1 ? 'B' : 'A' });
      }
    }
    config.matchStateEngine.applyEvents(webhookToGameEvents(event, normalized));

    // FACEIT updates Elo/skill level after the match is finished. Fetch the
    // profile with cache disabled so the app immediately gets the new values.
    if (event === 'match_status_finished') {
      try {
        const freshPlayer = await config.faceitClient.getPlayerById(linkedAccount.faceitUserId, { ttlMs: 0 });
        const cs2 = freshPlayer.games?.cs2;
        await updateFaceitAccountProfile(config.db, {
          userId: linkedAccount.userId,
          nickname: freshPlayer.nickname,
          avatar: freshPlayer.avatar,
          country: freshPlayer.country,
          skillLevel: cs2?.skill_level,
          elo: cs2?.faceit_elo,
        });
        await upsertPlayer(config.db, {
          faceitPlayerId: freshPlayer.player_id,
          nickname: freshPlayer.nickname,
          avatar: freshPlayer.avatar,
          country: freshPlayer.country,
          skillLevel: cs2?.skill_level,
          elo: cs2?.faceit_elo,
        });
        config.logger.info('faceit_profile_refreshed_after_match', {
          matchId,
          linkedUserId: linkedAccount.userId,
          skillLevel: cs2?.skill_level ?? null,
          elo: cs2?.faceit_elo ?? null,
        });
      } catch (error) {
        config.logger.warn('faceit_profile_refresh_after_match_failed', {
          matchId,
          linkedUserId: linkedAccount.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    config.logger.info('faceit_webhook_processed', { event, matchId, linkedUserId: linkedAccount.userId, status: normalized.status });
    return reply.send({ ok: true, event, matchId, status: normalized.status });
  });
}
