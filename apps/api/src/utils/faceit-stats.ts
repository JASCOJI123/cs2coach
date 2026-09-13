import { upsertPlayerStatistics } from '@cs2coach/database';
import type { AppConfig } from '../config';

type PlayerStats = {
  kills?: number;
  deaths?: number;
  assists?: number;
  adr?: number | null;
  kast?: number | null;
  rating?: number | null;
  openingKills?: number;
  openingDeaths?: number;
  utilityDamage?: number;
  flashAssists?: number;
  clutches?: number;
  headshots?: number;
  headshotsPercent?: number | null;
  totalDamage?: number;
  mvps?: number;
  tripleKills?: number;
  quadroKills?: number;
  aceKills?: number;
};

function keyOf(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, ''); }

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value.replace('%', '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statValue(stats: Record<string, unknown>, ...names: string[]): number | undefined {
  const wanted = new Set(names.map(keyOf));
  for (const [key, value] of Object.entries(stats)) if (wanted.has(keyOf(key))) return numberValue(value);
  return undefined;
}

function playerStatsFromPayload(payload: unknown, playerId: string): Record<string, unknown> | null {
  const seen = new Set<object>();
  const walk = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object') return null;
    if (seen.has(value as object)) return null;
    seen.add(value as object);
    if (Array.isArray(value)) {
      for (const item of value) { const found = walk(item); if (found) return found; }
      return null;
    }
    const obj = value as Record<string, unknown>;
    if (obj.player_id === playerId) {
      const stats = obj.player_stats ?? obj.stats;
      if (stats && typeof stats === 'object' && !Array.isArray(stats)) return stats as Record<string, unknown>;
    }
    for (const child of Object.values(obj)) { const found = walk(child); if (found) return found; }
    return null;
  };
  return walk(payload);
}

export function normalizeFaceitPlayerStats(raw: Record<string, unknown>): PlayerStats {
  return {
    kills: statValue(raw, 'Kills'),
    deaths: statValue(raw, 'Deaths'),
    assists: statValue(raw, 'Assists'),
    adr: statValue(raw, 'ADR', 'Average Damage per Round'),
    kast: statValue(raw, 'KAST'),
    rating: statValue(raw, 'Rating'),
    openingKills: statValue(raw, 'Opening Kills', 'Opening Kill'),
    openingDeaths: statValue(raw, 'Opening Deaths', 'Opening Death'),
    utilityDamage: statValue(raw, 'Utility Damage', 'Utility Damage Per Round'),
    flashAssists: statValue(raw, 'Flash Assists', 'Flash Assist'),
    clutches: statValue(raw, 'Clutches', 'Clutch Kills'),
    headshots: statValue(raw, 'Headshots', 'Headshot'),
    headshotsPercent: statValue(raw, 'Headshots %', 'Headshot %'),
    totalDamage: statValue(raw, 'Total Damage'),
    mvps: statValue(raw, 'MVPs', 'MVP'),
    tripleKills: statValue(raw, 'Triple Kills', 'Triple Kill'),
    quadroKills: statValue(raw, 'Quadro Kills', 'Quadro Kill', 'Quad Kills'),
    aceKills: statValue(raw, 'Ace Kills', 'Ace Kill'),
  };
}

export async function syncFaceitPlayerMatchStats(config: AppConfig, dbMatchId: string, dbPlayerId: string, faceitPlayerId: string, faceitMatchId: string): Promise<PlayerStats | null> {
  const payload = await config.faceitClient.getMatchStats(faceitMatchId);
  const raw = playerStatsFromPayload(payload, faceitPlayerId);
  if (!raw) return null;
  const stats = normalizeFaceitPlayerStats(raw);
  await upsertPlayerStatistics(config.db, {
    playerId: dbPlayerId,
    matchId: dbMatchId,
    kills: stats.kills,
    deaths: stats.deaths,
    assists: stats.assists,
    adr: stats.adr,
    kast: stats.kast,
    rating: stats.rating,
    openingKills: stats.openingKills,
    openingDeaths: stats.openingDeaths,
    utilityDamage: stats.utilityDamage,
    flashAssists: stats.flashAssists,
    clutches: stats.clutches,
  });
  await config.db`
    UPDATE player_statistics
    SET headshots=${stats.headshots ?? 0}, headshots_percent=${stats.headshotsPercent ?? null}, total_damage=${stats.totalDamage ?? 0},
        mvps=${stats.mvps ?? 0}, triple_kills=${stats.tripleKills ?? 0}, quadro_kills=${stats.quadroKills ?? 0}, ace_kills=${stats.aceKills ?? 0}
    WHERE player_id=${dbPlayerId} AND match_id=${dbMatchId}`;

  const rounds = Array.isArray((payload as any)?.rounds) ? (payload as any).rounds : [];
  const map = rounds.map((r: any) => r?.round_stats?.Map ?? r?.round_stats?.map).find((m: unknown) => typeof m === 'string' && m.trim());
  if (map) await config.db`UPDATE matches SET map=${String(map).trim()}, updated_at=now() WHERE id=${dbMatchId}`;
  return stats;
}
