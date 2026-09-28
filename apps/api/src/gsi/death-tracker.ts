// Detects the local player's deaths from the CS2 GSI stream.
//
// GSI only describes the player whose client sends it (`provider`). While that
// player is alive, `player` is themselves; after death `player` switches to
// whoever they spectate, or reports 0 health. We remember the last own alive
// position and turn the alive → dead transition into a death record.

type GsiBody = Record<string, any>;
export type Side = 'CT' | 'T';

export interface DeathTrackerMemory {
  matchDbId?: string;
  playerDbId?: string;
  phase?: string;
  liveRound?: number;
  roundLiveAt?: number;
  alive: boolean;
  last?: { x: number; y: number; z: number; side: Side | null; weapon: string | null };
  lastSeen: number;
}

export interface DetectedDeath {
  roundNumber: number;
  secondsIntoRound: number | null;
  side: Side | null;
  x: number;
  y: number;
  z: number;
  weapon: string | null;
}

export interface TrackerResult {
  death?: DetectedDeath;
  roundEnded?: { roundNumber: number; winnerSide: Side };
}

function parsePosition(value: unknown): { x: number; y: number; z: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value.split(',').map((v) => Number(v.trim()));
  return parts.length === 3 && parts.every(Number.isFinite) ? { x: parts[0]!, y: parts[1]!, z: parts[2]! } : undefined;
}

function activeWeapon(player: any): string | null {
  const weapons = player?.weapons && typeof player.weapons === 'object' ? Object.values(player.weapons) : [];
  const active = weapons.find((w: any) => w?.state === 'active') as { name?: unknown } | undefined;
  return typeof active?.name === 'string' ? active.name.replace(/^weapon_/, '') : null;
}

function sideOf(value: unknown): Side | null {
  return value === 'CT' || value === 'T' ? value : null;
}

/** 1-based number of the round being played, from the team scores. */
function roundFromScore(body: GsiBody): number {
  const ct = Number(body.map?.team_ct?.score ?? 0);
  const t = Number(body.map?.team_t?.score ?? 0);
  return Number.isFinite(ct + t) ? Math.max(1, ct + t + 1) : 1;
}

export function observeTick(memory: DeathTrackerMemory, body: GsiBody, now: number): TrackerResult {
  const result: TrackerResult = {};
  memory.lastSeen = now;
  if (body.map?.phase !== 'live') { memory.phase = body.round?.phase; memory.alive = false; return result; }

  const phase = typeof body.round?.phase === 'string' ? body.round.phase : undefined;
  const providerId = typeof body.provider?.steamid === 'string' ? body.provider.steamid : null;
  const own = providerId !== null && body.player?.steamid === providerId;
  const health = Number(body.player?.state?.health ?? 0);

  if (phase === 'live' && memory.phase !== 'live') {
    // Scores do not change during a round, so this is the round that just went live.
    memory.liveRound = roundFromScore(body);
    memory.roundLiveAt = now;
  }
  if (phase === 'over' && memory.phase === 'live' && memory.liveRound !== undefined) {
    const winner = sideOf(body.round?.win_team);
    if (winner) result.roundEnded = { roundNumber: memory.liveRound, winnerSide: winner };
  }
  if (phase === 'freezetime') { memory.alive = false; memory.last = undefined; }

  const position = own ? parsePosition(body.player?.position) : undefined;
  if (own && health > 0 && position) {
    memory.alive = true;
    memory.last = { ...position, side: sideOf(body.player?.team), weapon: activeWeapon(body.player) };
  } else if (memory.alive && memory.last && phase === 'live' && memory.liveRound !== undefined) {
    const seconds = memory.roundLiveAt !== undefined ? Math.round((now - memory.roundLiveAt) / 100) / 10 : null;
    result.death = { roundNumber: memory.liveRound, secondsIntoRound: seconds, ...memory.last };
    memory.alive = false;
  }

  memory.phase = phase;
  return result;
}
