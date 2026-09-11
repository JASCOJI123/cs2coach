/**
 * EconomyEngine (spec §28). CS2 economy rules: loss bonus, round money, and a
 * deterministic buy classifier that must drive tactical recommendations.
 * All values are either observed (from GSI/FACEIT stats) or clearly-labeled
 * estimates — never fabricated "live" economy.
 */
import { type BuyType, type TeamEconomy } from '@cs2coach/shared';

export function lossBonusForStreak(consecutiveLosses: number): number {
  const streak = Math.max(0, Math.min(4, consecutiveLosses));
  // 1400, 1900, 2400, 2900, 3400
  return 1400 + streak * 500;
}

export function classifyEconomy(input: {
  money: number;
  sawRifles: boolean;
  haveUtility: boolean;
  forced?: boolean;
  round: number;
}): BuyType {
  const { money, sawRifles, round } = input;
  if (input.forced) return 'FORCE_BUY';
  if (round === 1) return money >= 800 ? 'FULL_BUY' : 'FORCE_BUY';
  if (money >= 4400 && sawRifles) return 'FULL_BUY';
  if (money >= 3100 && sawRifles) return 'HALF_BUY';
  if (money >= 2800) return 'FORCE_BUY';
  if (money >= 2000) return money >= 2400 ? 'ANTI_ECO' : 'LOW_BUY';
  if (money >= 1200) return 'SAVE';
  return 'ECO';
}

export function estimateEnemyMoney(input: {
  wonLastRounds: number;
  lostStreak: number;
  lastKnown?: number;
}): number {
  // Crude, clearly labeled estimate. If nothing is known we cannot center a
  // recommendation on money — callers must treat `undefined` as "not known".
  if (input.lastKnown !== undefined) return input.lastKnown;
  return undefined as unknown as number;
}

export interface EconomyContext {
  classify(state: TeamEconomy | undefined, round: number): BuyType | undefined;
}

export class EconomyEngine {
  classify(economy: TeamEconomy | undefined, round: number, forced = false): BuyType | undefined {
    if (!economy) return undefined;
    return classifyEconomy({
      money: economy.money,
      sawRifles: economy.weapons.length >= 2 && economy.weapons.some((w) => /rifle|awp/i.test(w)),
      haveUtility: economy.utility.length > 0,
      forced,
      round,
    });
  }
}