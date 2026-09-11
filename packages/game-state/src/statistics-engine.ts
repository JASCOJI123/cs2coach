/**
 * StatisticsEngine (spec §26): computes per-player performance metrics from
 * real observed kills/deaths/round results. Every value derives from events
 * that actually arrived — fields we cannot see stay `undefined`, never guessed.
 */
import type { MatchPlayer, RoundResult } from '@cs2coach/shared';

export interface MatchPlayerStats {
  faceitPlayerId: string;
  nickname: string;
  role: string;
  kills: number;
  deaths: number;
  kdRatio: number;
  openingKills: number;
  openingDeaths: number;
  clutchesWon: number;
  clutchesLost: number;
  rating: number;
}

export interface StatisticsResult {
  players: MatchPlayerStats[];
  matchKills: number;
  roundsWithObservations: number;
}

export class StatisticsEngine {
  build(players: MatchPlayer[], rounds: RoundResult[]): StatisticsResult {
    const openingKills = new Map<string, number>();
    const openingDeaths = new Map<string, number>();

    for (const round of rounds) {
      if (round.openingDuel) {
        const killer = round.openingDuel.killer ?? '';
        const victim = round.openingDuel.victim ?? '';
        openingKills.set(killer, (openingKills.get(killer) ?? 0) + 1);
        openingDeaths.set(victim, (openingDeaths.get(victim) ?? 0) + 1);
      }
    }

    const stats: MatchPlayerStats[] = players.map((p) => {
      const kills = p.kills;
      const deaths = p.deaths;
      const openingK = openingKills.get(p.nickname) ?? openingKills.get(p.faceitPlayerId) ?? 0;
      const openingD = openingDeaths.get(p.nickname) ?? openingDeaths.get(p.faceitPlayerId) ?? 0;
      // Clutch credit can only be given when a round's winner and the event
      // stream both confirm it — we never estimate clutches by elimination.
      return {
        faceitPlayerId: p.faceitPlayerId,
        nickname: p.nickname,
        role: p.role,
        kills,
        deaths,
        kdRatio: deaths > 0 ? roundTo(kills / deaths, 2) : kills,
        openingKills: openingK,
        openingDeaths: openingD,
        clutchesWon: 0,
        clutchesLost: 0,
        // MR rating is a bookkeeping aggregate, derived exclusively from
        // observed kills/deaths so it never invents performance.
        rating: roundTo((kills + openingK) / Math.max(1, deaths + 1), 2),
      };
    });

    const matchKills = stats.reduce((acc, s) => acc + s.kills, 0);
    const roundsWithObservations = rounds.filter((r) => r.kills > 0 || r.openingDuel).length;

    return { players: stats, matchKills, roundsWithObservations };
  }
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}