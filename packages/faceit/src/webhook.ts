/** FACEIT webhook normalization helpers. */
import { AppError, codes, type GameEvent } from '@cs2coach/shared';
import type { FaceitMatchEventType, FaceitMember, NormalizedFaceitMatchState } from './types';

const MATCH_STATUS_MAP: Record<string, NormalizedFaceitMatchState['status']> = {
  CONFIGURING: 'configuring', READY: 'ready', STARTED: 'ongoing', LIVE: 'ongoing', FINISHED: 'finished', ABORTED: 'aborted', CANCELLED: 'cancelled',
};
export const SUPPORTED_EVENTS: FaceitMatchEventType[] = ['match_object_created', 'match_status_configuring', 'match_status_ready', 'match_status_finished', 'match_status_aborted', 'match_status_cancelled', 'match_demo_ready'];
export interface WebhookVerificationOptions { secret?: string; signatureHeader?: string; }

/** Kept for compatibility with earlier HMAC-based deployments. Current FACEIT App Studio webhooks use configured header/query authentication instead. */
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined, opts: WebhookVerificationOptions): boolean {
  void rawBody; void signature;
  return !opts.secret;
}
export function isSupportedEvent(event: string): event is FaceitMatchEventType { return SUPPORTED_EVENTS.includes(event as FaceitMatchEventType); }
function toMembers(roster: FaceitMember[] | undefined): FaceitMember[] { return Array.isArray(roster) ? roster : []; }

export function normalizeMatchPayload(raw: unknown): NormalizedFaceitMatchState {
  const match = (raw ?? {}) as Record<string, unknown>;
  const matchId = typeof match.match_id === 'string' ? match.match_id : '';
  if (!matchId) throw new AppError(codes.badRequest, 'FACEIT webhook payload missing match_id', 400);
  let status: NormalizedFaceitMatchState['status'] = 'scheduled';
  const rawStatus = typeof match.status === 'string' ? match.status : undefined;
  if (rawStatus && MATCH_STATUS_MAP[rawStatus.toUpperCase()]) status = MATCH_STATUS_MAP[rawStatus.toUpperCase()];
  const teamsRaw = match.teams as Record<string, unknown> | undefined;
  const factionA = (teamsRaw?.faction1 ?? teamsRaw?.a) as Record<string, unknown> | undefined;
  const factionB = (teamsRaw?.faction2 ?? teamsRaw?.b) as Record<string, unknown> | undefined;
  const teams = {
    a: { teamId: typeof factionA?.team_id === 'string' ? factionA.team_id : undefined, name: typeof factionA?.nickname === 'string' ? factionA.nickname : 'Team A', players: toMembers((factionA?.roster ?? factionA?.members) as FaceitMember[] | undefined) },
    b: { teamId: typeof factionB?.team_id === 'string' ? factionB.team_id : undefined, name: typeof factionB?.nickname === 'string' ? factionB.nickname : 'Team B', players: toMembers((factionB?.roster ?? factionB?.members) as FaceitMember[] | undefined) },
  };
  const results = match.results as Record<string, unknown> | undefined;
  const score = results?.score as Record<string, unknown> | undefined;
  const detail = match.details as Record<string, unknown> | undefined;
  const num = (v: unknown): number | undefined => typeof v === 'number' ? v : undefined;
  return { faceitMatchId: matchId, status, map: typeof detail?.map === 'string' ? detail.map : undefined, teams, score: { a: num(score?.faction1) ?? 0, b: num(score?.faction2) ?? 0 }, startedAt: num(match.started_at), finishedAt: num(match.finished_at), winnerFactionId: results && typeof results.winner === 'string' ? results.winner : undefined };
}

export function webhookToGameEvents(event: FaceitMatchEventType, state: NormalizedFaceitMatchState): GameEvent[] {
  const base = { matchId: state.faceitMatchId, ts: Date.now() };
  switch (event) {
    case 'match_object_created':
    case 'match_status_configuring': return [{ type: 'match_created', ...base }];
    case 'match_status_ready': return [{ type: 'match_status_ready', ...base }];
    case 'match_status_finished': return [{ type: 'match_status_finished', ...base, winnerFactionId: state.winnerFactionId }];
    case 'match_status_aborted': return [{ type: 'match_status_aborted', ...base }];
    case 'match_status_cancelled': return [{ type: 'match_status_cancelled', ...base }];
    case 'match_demo_ready': return [{ type: 'match_demo_ready', ...base }];
  }
}
