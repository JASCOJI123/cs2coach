import type { MatchState } from '@cs2coach/shared';

export interface Cs2GsiSnapshot {
  map?: { name?: string; phase?: string; team_ct?: { score?: number }; team_t?: { score?: number } };
  round?: { phase?: string; win_team?: string; bomb?: string };
  player?: {
    steamid?: string;
    name?: string;
    team?: string;
    state?: { health?: number; armor?: number; money?: number };
    match_stats?: { kills?: number; deaths?: number; assists?: number };
    weapons?: Record<string, { name?: string; type?: string; ammo_clip?: number }>;
    position?: string;
  };
  allplayers?: Record<string, {
    name?: string;
    team?: string;
    state?: { health?: number; armor?: number; money?: number };
    match_stats?: { kills?: number; deaths?: number; assists?: number };
    weapons?: Record<string, { name?: string; type?: string }>;
    position?: string;
  }>;
  bomb?: { state?: string; position?: string };
}

export type Cs2GsiEdgeEvent =
  | { type: 'round_start'; round: number }
  | { type: 'round_over'; round: number; winner?: 'CT' | 'T' }
  | { type: 'bomb_planted' | 'bomb_defused' | 'bomb_exploded' }
  | { type: 'match_over' }
  | { type: 'snapshot'; state: MatchState };

export function normalizePosition(value?: string): { x: number; y: number; z: number } | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return undefined;
  return { x: parts[0]!, y: parts[1]!, z: parts[2]! };
}

function teamOfPlayer(p: Cs2GsiSnapshot['player'] | NonNullable<Cs2GsiSnapshot['allplayers']>[string]): 'CT' | 'T' | undefined {
  return p?.team === 'CT' || p?.team === 'T' ? p.team : undefined;
}

export function extractWeaponNames(player: Cs2GsiSnapshot['player'] | NonNullable<Cs2GsiSnapshot['allplayers']>[string]): string[] {
  return player?.weapons ? Object.values(player.weapons).map((w) => w.name).filter((v): v is string => Boolean(v)).slice(0, 16) : [];
}

export function buildTelemetry(snapshot: Cs2GsiSnapshot): {
  playerIds: string[];
  alivePlayers: number;
  positions: Record<string, { x: number; y: number; z: number }>;
  weapons: Record<string, string[]>;
  economy: Record<string, number>;
} {
  const players = snapshot.allplayers ?? {};
  const playerIds = Object.keys(players);
  const positions: Record<string, { x: number; y: number; z: number }> = {};
  const weapons: Record<string, string[]> = {};
  const economy: Record<string, number> = {};

  for (const [id, player] of Object.entries(players)) {
    const pos = normalizePosition(player.position);
    if (pos) positions[id] = pos;
    const names = extractWeaponNames(player);
    if (names.length) weapons[id] = names;
    const money = player.state?.money;
    if (typeof money === 'number') economy[id] = money;
  }

  return {
    playerIds,
    alivePlayers: playerIds.reduce((n, id) => n + ((players[id]?.state?.health ?? 0) > 0 ? 1 : 0), 0),
    positions,
    weapons,
    economy,
  };
}

export class Cs2GsiEdgeDetector {
  private previousRoundPhase?: string;
  private previousBombState?: string;
  private previousMapPhase?: string;
  private previousRound?: number;

  detect(snapshot: Cs2GsiSnapshot, currentRound: number): Cs2GsiEdgeEvent[] {
    const events: Cs2GsiEdgeEvent[] = [];
    const phase = snapshot.round?.phase;
    const bombState = snapshot.bomb?.state ?? snapshot.round?.bomb;
    const mapPhase = snapshot.map?.phase;

    if (phase === 'freezetime' && this.previousRound !== currentRound) {
      events.push({ type: 'round_start', round: currentRound });
    }
    if (phase === 'over' && this.previousRoundPhase !== 'over') {
      const winner = snapshot.round?.win_team === 'CT' || snapshot.round?.win_team === 'T' ? snapshot.round.win_team : undefined;
      events.push({ type: 'round_over', round: currentRound, winner });
    }

    if (bombState === 'planted' && this.previousBombState !== 'planted') events.push({ type: 'bomb_planted' });
    if (bombState === 'defused' && this.previousBombState !== 'defused') events.push({ type: 'bomb_defused' });
    if (bombState === 'exploded' && this.previousBombState !== 'exploded') events.push({ type: 'bomb_exploded' });
    if (mapPhase === 'gameover' && this.previousMapPhase !== 'gameover') events.push({ type: 'match_over' });

    this.previousRoundPhase = phase;
    this.previousBombState = bombState;
    this.previousMapPhase = mapPhase;
    this.previousRound = currentRound;
    return events;
  }
}
