/**
 * Deterministic structural hashing (spec §54 → state hashing).
 * If a recomputed hash equals the stored one, the state did not meaningfully
 * change and the AI layer must not be called again.
 */
import { createHash } from 'node:crypto';
import type { MatchState, OpponentPattern } from './types';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashValue(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}

/**
 * Select the fields that drive tactical decisions.
 * Positions/raw events are intentionally excluded so cosmetic updates do not
 * invalidate an AI decision.
 */
export function selectTacticalState(
  m: Pick<MatchState, 'map' | 'status' | 'phase' | 'score' | 'round' | 'side' | 'economy' | 'previousRounds' | 'opponentPatterns'>,
): unknown {
  return {
    map: m.map ?? null,
    status: m.status,
    phase: m.phase,
    score: m.score,
    round: m.round,
    side: m.side ?? null,
    economy: m.economy
      ? {
          a: { money: m.economy.a.money, buyType: m.economy.a.buyType },
          b: { money: m.economy.b.money, buyType: m.economy.b.buyType },
        }
      : null,
    lastRounds: m.previousRounds.slice(-4).map((r) => ({
      round: r.round,
      winner: r.winner ?? null,
      reason: r.winReason ?? null,
      opens: r.openingDuel ? `${r.openingDuel.killer ?? ''}->${r.openingDuel.victim ?? ''}` : null,
    })),
    topPatterns: m.opponentPatterns
      .slice()
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 6)
      .map((p) => `${p.player?.nickname ?? '?'}:${p.location}:${p.frequency.toFixed(2)}`),
  };
}

export function hashMatchState(m: MatchState): string {
  return hashValue(selectTacticalState(m));
}

/** Return the top `n` patterns by frequency (score 0..1), best first. */
export function pickTopPatterns(patterns: readonly OpponentPattern[], n: number): OpponentPattern[] {
  return patterns
    .slice()
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, n);
}