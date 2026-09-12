import type { FastifyInstance } from 'fastify';
import { AppError, codes } from '@cs2coach/shared';
import { addMatchPlayer, findFaceitAccountByFaceitUserId, upsertMatchFromFaceit, upsertPlayer } from '@cs2coach/database';
import { isSupportedEvent, normalizeMatchPayload, webhookToGameEvents } from '@cs2coach/faceit';
import type { FaceitFaction } from '@cs2coach/faceit';
import type { AppConfig } from '../config';

function headerValue(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function findMatchId(body: Record<string, unknown>): string | null {
  const payload = (body.payload ?? body.data ?? body) as Record<string, unknown> | undefined;
  const direct = [payload?.match_id, payload?.matchId, body.match_id, body.matchId];
  return direct.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
}
function rosterForFaction(faction: FaceitFaction): FaceitFaction['roster'] {
  return Array.isArray(faction.roster) ? faction.roster : faction.members;
}

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

    const match = await upsertMatchFromFaceit(config.db, {
      faceitMatchId: detail.match_id,
      game: detail.game ?? 'cs2',
      competition: detail.competition_name ?? detail.competition_id ?? null,
      map: detail.details?.map ?? null,
      status: normalized.status,
      startedAtMs: detail.started_at ? detail.started_at * 1000 : null,
      finishedAtMs: detail.finished_at ? detail.finished_at * 1000 : null,
      scoreA: detail.results?.score?.faction1 ?? 0,
      scoreB: detail.results?.score?.faction2 ?? 0,
    });

    for (let index = 0; index < teams.length; index += 1) {
      for (const member of rosterForFaction(teams[index])) {
        const player = await upsertPlayer(config.db, { faceitPlayerId: member.player_id, nickname: member.nickname, avatar: member.avatar, skillLevel: member.skill_level });
        await addMatchPlayer(config.db, { matchId: match.id, playerId: player.id, team: index === 1 ? 'B' : 'A' });
      }
    }

    config.matchStateEngine.applyEvents(webhookToGameEvents(event, normalized));
    config.logger.info('faceit_webhook_processed', { event, matchId, linkedUserId: linkedAccount.userId, status: normalized.status });
    return reply.send({ ok: true, event, matchId, status: normalized.status });
  });
}
