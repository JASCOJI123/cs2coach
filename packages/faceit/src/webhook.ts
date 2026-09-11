/**
 * FACEIT webhook handling (spec §15).
 * Supported lifecycle events are normalized to `GameEvent` objects so the rest
 * of the pipeline is provider-agnostic. Processing must be idempotent (upserts).
 */
import { AppError, codes, type FaceitTeamRef, type GameEvent } from '@cs2coach/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FaceitMatchEventType, FaceitMember, NormalizedFaceitMatchState } from './types';

const MATCH_STATUS_MAP: Record<string, NormalizedFaceitMatchState['status']> = {
  CONFIGURING: 'configuring',
  READY: 'ready',
  STARTED: 'ongoing',
  LIVE: 'ongoing',
  FINISHED: 'finished',
  ABORTED: 'aborted',
  CANCELLED: 'cancelled',
};

/** FACEIT webhook event types this product consumes. */
export const SUPPORTED_EVENTS: FaceitMatchEventType[] = [
  'match_object_created',
  'match_status_configuring',
  'match_status_ready',
  'match_status_started',
  'match_status_finished',
  'match_status_aborted',
  'match_status_cancelled',
  'match_demo_ready',
];

export interface WebhookVerificationOptions {
  secret?: string;
  /** Header that carries the HMAC/SHA256 sha256 signature, if FACEIT signs it. */
  signatureHeader?: string;
}

/**
 * Verify a webhook signature when a secret is configured.
 * FACEIT does not sign webhooks by default — the verification only activates
 * when FACEIT_WEBHOOK_SECRET is set so we never reject unsigned traffic that
 * cannot be signed. In production an explicit shared secret on a custom header
 * is additionally supported.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  opts: WebhookVerificationOptions,
): boolean {
  if (!opts.secret) return true;
  if (!signature) return false;
  const expected = createHmac('sha256', opts.secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isSupportedEvent(event: string): event is FaceitMatchEventType {
  return SUPPORTED_EVENTS.includes(event as FaceitMatchEventType);
}

function toMembers(roster: FaceitMember[] | undefined): FaceitMember[] {
  return Array.isArray(roster) ? roster : [];
}

/**
 * Flatten a FACEIT match payload into the state shape the pipeline consumes.
 * `teams` may be a Record keyed by either team id or faction position; FACEIT
 * conventionally exposes `teams.faction1`/`faction2` on list payloads and a map
 * on detail payloads.
 */
export function normalizeMatchPayload(raw: unknown): NormalizedFaceitMatchState {
  const match = (raw ?? {}) as Record<string, unknown>;
  const matchId = typeof match.match_id === 'string' ? match.match_id : '';
  if (!matchId) throw new AppError(codes.badRequest, 'FACEIT webhook payload missing match_id', 400);

  let status: NormalizedFaceitMatchState['status'] = 'scheduled';
  const rawStatus = typeof match.status === 'string' ? match.status : 'FINISHED' in match ? 'finished' : undefined;
  if (rawStatus && MATCH_STATUS_MAP[rawStatus.toUpperCase()]) {
    status = MATCH_STATUS_MAP[rawStatus.toUpperCase()];
  }

  const teamsRaw = match.teams as Record<string, unknown> | undefined;
  const factionA = (teamsRaw?.faction1 ?? teamsRaw?.a) as Record<string, unknown> | undefined;
  const factionB = (teamsRaw?.faction2 ?? teamsRaw?.b) as Record<string, unknown> | undefined;

  const teams = {
    a: {
      teamId: typeof factionA?.team_id === 'string' ? (factionA.team_id as string) : undefined,
      name: typeof factionA?.nickname === 'string' ? (factionA.nickname as string) : 'Team A',
      players: toMembers(factionA?.roster as FaceitMember[] | undefined),
    },
    b: {
      teamId: typeof factionB?.team_id === 'string' ? (factionB.team_id as string) : undefined,
      name: typeof factionB?.nickname === 'string' ? (factionB.nickname as string) : 'Team B',
      players: toMembers(factionB?.roster as FaceitMember[] | undefined),
    },
  };

  const results = match.results as Record<string, unknown> | undefined;
  const score = results?.score as Record<string, unknown> | undefined;

  const detail = match.details as Record<string, unknown> | undefined;
  const map = typeof detail?.map === 'string' ? (detail.map as string) : undefined;

  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

  return {
    faceitMatchId: matchId,
    status,
    map,
    teams,
    score: {
      a: num(score?.faction1) ?? 0,
      b: num(score?.faction2) ?? 0,
    },
    startedAt: num(match.started_at) ?? undefined,
    finishedAt: num(match.finished_at) ?? undefined,
    winnerFactionId: results && typeof results.winner === 'string' ? (results.winner as string) : undefined,
  };
}

/** Build `match_*` GameEvents from a supported FACEIT webhook. */
export function webhookToGameEvents(event: FaceitMatchEventType, state: NormalizedFaceitMatchState): GameEvent[] {
  const ts = Date.now();
  const base = { matchId: state.faceitMatchId, ts };

  switch (event) {
    case 'match_object_created':
    case 'match_status_configuring':
      return [{ type: 'match_created', ...base }];
    case 'match_status_ready':
      return [{ type: 'match_status_ready', ...base }];
    case 'match_status_started':
      return [
        {
          type: 'match_started',
          ...base,
          map: state.map,
          teams: { a: toTeamRef(state.teams?.a), b: toTeamRef(state.teams?.b) },
        },
      ];
    case 'match_status_finished':
      return [{ type: 'match_status_finished', ...base, winnerFactionId: state.winnerFactionId }];
    case 'match_status_aborted':
      return [{ type: 'match_status_aborted', ...base }];
    case 'match_status_cancelled':
      return [{ type: 'match_status_cancelled', ...base }];
    case 'match_demo_ready':
      return [{ type: 'match_demo_ready', ...base }];
  }
}

type NormalizedTeam = { teamId?: string; name?: string; players: FaceitMember[] };

function toTeamRef(team: NormalizedTeam | undefined): FaceitTeamRef {
  return {
    teamId: team?.teamId,
    name: team?.name,
    players: (team?.players ?? []).map((m) => ({
      faceitPlayerId: m.player_id,
      nickname: m.nickname,
      avatar: m.avatar,
      skillLevel: m.skill_level,
    })),
  };
}