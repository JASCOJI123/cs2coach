import type { GameEvent } from '@cs2coach/shared';

export interface GsiSnapshot { phase?: string; round: number; scoreCT: number; scoreT: number; bomb?: string; health?: number; steamId?: string; }
function n(v: unknown, fallback = 0): number { const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function roundOf(body: any): number { return Math.max(1, n(body?.map?.round, n(body?.map?.team_ct?.score) + n(body?.map?.team_t?.score) + 1)); }
export function readGsiSnapshot(body: unknown): GsiSnapshot {
  const b: any = body && typeof body === 'object' ? body : {};
  return { phase: typeof b.round?.phase === 'string' ? b.round.phase : undefined, round: roundOf(b), scoreCT: n(b.map?.team_ct?.score), scoreT: n(b.map?.team_t?.score), bomb: typeof b.round?.bomb === 'string' ? b.round.bomb : typeof b.bomb?.state === 'string' ? b.bomb.state : undefined, health: n(b.player?.state?.health, 0), steamId: typeof b.player?.steamid === 'string' ? b.player.steamid : typeof b.provider?.steamid === 'string' ? b.provider.steamid : undefined };
}
export function normalizeGsiSnapshot(matchId: string, body: unknown, previous?: GsiSnapshot): GameEvent[] | GsiSnapshot {
  const b: any = body && typeof body === 'object' ? body : {};
  const current = readGsiSnapshot(body);
  if (!previous) return current;
  const events: GameEvent[] = [];
  const ts = Date.now();
  if (previous.round !== current.round && current.phase === 'freezetime') events.push({ type: 'round_started', matchId, ts, round: current.round, side: b.player?.team === 'CT' || b.player?.team === 'T' ? b.player.team : undefined });
  if (previous.phase !== 'over' && current.phase === 'over') events.push({ type: 'round_ended', matchId, ts, round: current.round, winner: b.round?.win_team });
  if (previous.scoreCT !== current.scoreCT || previous.scoreT !== current.scoreT) events.push({ type: 'score_updated', matchId, ts, scoreA: current.scoreCT, scoreB: current.scoreT });
  if (previous.bomb !== current.bomb && (current.bomb === 'planted' || current.bomb === 'defused' || current.bomb === 'exploded')) events.push({ type: 'bomb_state', matchId, ts, planted: current.bomb === 'planted', defused: current.bomb === 'defused' });
  return events;
}
