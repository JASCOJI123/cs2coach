/**
 * RoundEngine (spec §25): turns round lifecycle events + observed kills into a
 * structured RoundResult and a deterministic (non-AI) round analysis. Groq is
 * only consulted later, for the strategy itself — never for bookkeeping.
 */
import { type GameEvent, type MatchState, type RoundResult } from '@cs2coach/shared';

export interface RoundAnalysis {
  reason: string;
  detected: string[];
  nextRoundHint: string;
  hasSignal: boolean;
}

export class RoundEngine {
  /**
   * Build a RoundResult from the `round_ended` event and kills observed during
   * the round. `killsInRound` is the pending list captured by the engine —
   * every kill is a real observed event.
   */
  finalizeRound(state: MatchState, event: Extract<GameEvent, { type: 'round_ended' }>, killsInRound: GameEvent[]): RoundResult {
    const killEvents = killsInRound.filter((e): e is Extract<GameEvent, { type: 'player_kill' }> => e.type === 'player_kill');
    const firstKill = killEvents[0];

    return {
      round: event.round,
      winner: event.winner,
      winReason: event.reason,
      kills: killEvents.length,
      deaths: killEvents.length,
      openingDuel: firstKill
        ? { killer: firstKill.killer.nickname, victim: firstKill.victim.nickname }
        : undefined,
      bomb: {
        planted: state.bomb.planted,
        site: state.bomb.site,
        defused: state.bomb.defused === true,
      },
      economyAtStart: event.economy,
    };
  }

  /**
   * Deterministic analysis (no AI): explain the round from observed facts and
   * emergency economic rules. Returns `hasSignal=false` when nothing real was
   * observed — the UI then shows "Waiting for game data", never fabrications.
   */
  analyzeRound(round: RoundResult, _state: MatchState): RoundAnalysis {
    const detected: string[] = [];
    const signals: string[] = [];

    if (round.openingDuel) {
      signals.push(`opening duel: ${round.openingDuel.killer} killed ${round.openingDuel.victim}`);
      detected.push(round.openingDuel.victim === round.winner ? 'opponent opening win' : 'opening kill for the winning side');
    }

    if (round.bomb.planted) {
      signals.push(`bomb planted on ${round.bomb.site === 'A' ? 'A' : round.bomb.site === 'B' ? 'B' : 'an unknown site'}`);
      detected.push(round.bomb.defused ? 'bomb defused' : 'bomb exploded');
    }

    if (round.economyAtStart) {
      const myBuy = round.economyAtStart.a;
      const enemyBuy = round.economyAtStart.b;
      signals.push(`economy at start: A ${myBuy.money}$ (${myBuy.buyType}), B ${enemyBuy.money}$ (${enemyBuy.buyType})`);
      if (enemyBuy.buyType === 'ECO') {
        detected.push('enemy bought on eco — an anti-eco was the correct approach');
      }
      if (myBuy.buyType === 'ECO') {
        detected.push('your side was on a low/eco economy');
      }
    }

    let reason = round.winReason ?? '';
    if (!reason) {
      if (round.bomb.planted) {
        reason = round.bomb.defused ? 'Bomb defused after a successful defense' : 'Bomb exploded';
      } else if (round.openingDuel) {
        reason = 'Round decided by elimination after the opening duel';
      } else {
        reason = 'Round ended (no detailed signals received)';
      }
    }

    const forced = round.economyAtStart && round.economyAtStart.b.buyType === 'ECO';
    const hasSignal = signals.length > 0 || Boolean(round.winReason) || round.bomb.planted;
    const nextRoundHint = forced ? 'Enemy economy is low — consider an anti-eco or force' : hasSignal ? 'Stick to the standard read and adapt to the opening duel' : 'Waiting for game data before recommending a plan';

    return { reason, detected, nextRoundHint, hasSignal };
  }
}