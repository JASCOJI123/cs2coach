/**
 * TacticalEngine (spec §29, §31): deterministic, rules-based tactics that run
 * when Groq is unavailable OR as a scoring layer over candidate actions. It
 * must never fabricate game state — it only makes decisions from the real
 * `MatchState` (economy, score, map, phase, patterns) already in hand.
 *
 * The engine's output is a live-delivery DTO (`TacticalDecision`), distinct
 * from the persisted `Recommendation` type used in databases.
 */
import {
  confidenceFromScore,
  type ActionType,
  type Confidence,
  type MatchState,
} from '@cs2coach/shared';

export interface LiveRecommendation {
  action: ActionType;
  detail: string;
  /** 1..5 urgency — the lower, the more urgent. */
  priority: number;
  confidence: Confidence;
  expiresAt?: number | null;
  timestamp: number;
}

export interface LiveInstruction {
  faceitPlayerId: string;
  nickname: string;
  role: string;
  instruction: string;
}

export interface TacticalSignal {
  label: string;
  detail: string;
}

export interface TacticalDecision {
  recommendation: LiveRecommendation;
  instructions: LiveInstruction[];
  signals: TacticalSignal[];
  /** true when produced by the deterministic engine (Groq was unavailable). */
  deterministic: boolean;
}

const URGENCY: Record<ActionType, number> = {
  DEFAULT: 5,
  A_EXECUTE: 2,
  B_EXECUTE: 2,
  MID_CONTROL: 3,
  FAST_A: 1,
  FAST_B: 1,
  SPLIT_A: 1,
  SPLIT_B: 1,
  ANTI_ECO: 1,
  FORCE: 1,
  SAVE: 4,
  RETREAT: 1,
};

export class TacticalEngine {
  scoreCandidate(candidate: LiveRecommendation, state: MatchState): number {
    const base = candidate.priority;
    const signalBonus = state.opponentPatterns.length > 0 ? 2 : 0;
    if (candidate.action === 'DEFAULT' && state.opponentPatterns.length > 0) return base - 1;
    return base + signalBonus;
  }

  /** Rank a list of AI candidates, most urgent first (lowest numeric). */
  rankCandidates(candidates: LiveRecommendation[], state: MatchState): LiveRecommendation[] {
    return [...candidates].sort((a, b) => this.scoreCandidate(a, state) - this.scoreCandidate(b, state));
  }

  decide(state: MatchState): TacticalDecision {
    const signals = this.readSignals(state);
    const economy = state.economy;

    const useForce = economy && economy.a.buyType === 'FORCE_BUY';
    const antiEco = economy && economy.b.buyType === 'ECO';
    const save = economy && economy.a.buyType === 'ECO';

    let action: ActionType;
    if (useForce) action = 'FORCE';
    else if (save) action = 'SAVE';
    else if (antiEco) action = 'ANTI_ECO';
    else action = state.score.b > state.score.a ? 'SAVE' : 'SPLIT_A';

    const executors = this.pickExecutors(action, state);

    return {
      recommendation: {
        action,
        detail: buildDetail(action, state, signals),
        priority: URGENCY[action],
        confidence: confidenceFromScore(Math.min(1, state.opponentPatterns.length / 5)),
        timestamp: state.timestamp,
      },
      instructions: executors.map((p) => ({
        faceitPlayerId: p.faceitPlayerId,
        nickname: p.nickname,
        role: p.role,
        instruction: this.instructionFor(action, p, state.map),
      })),
      signals,
      deterministic: true,
    } satisfies TacticalDecision;
  }

  private readSignals(state: MatchState): TacticalSignal[] {
    const out: TacticalSignal[] = [];
    if (state.opponentPatterns.length > 0) {
      const top = state.opponentPatterns[0];
      out.push({ label: 'pattern', detail: `${top.location} (${top.confidence.toLowerCase()}, n=${top.sampleSize})` });
    }
    if (state.bomb.planted) {
      out.push({ label: 'bomb', detail: state.bomb.site ? `planted at ${state.bomb.site}` : 'planted' });
    }
    if (state.economy) {
      out.push({ label: 'economy', detail: `A ${state.economy.a.buyType}, B ${state.economy.b.buyType}` });
    }
    return out;
  }

  private pickExecutors(action: ActionType, state: MatchState): { faceitPlayerId: string; nickname: string; role: string }[] {
    const alive = state.alivePlayers.length > 0 ? state.alivePlayers : state.players;
    if (action === 'FAST_A' || action === 'SPLIT_A' || action === 'ANTI_ECO') {
      return alive.slice(0, Math.min(5, alive.length));
    }
    return alive.slice(0, Math.max(1, alive.length));
  }

  private instructionFor(action: ActionType, player: { role: string }, map?: string): string {
    switch (action) {
      case 'FAST_A':
        return 'Rush A instantly; two pop flashes then entry.';
      case 'FAST_B':
        return 'Rush B instantly; one smoke to cut mid.';
      case 'SPLIT_A':
        return 'Split A: 3 main, 2 palace/connector.';
      case 'SPLIT_B':
        return 'Split B: 3 tunnels, 2 mid.';
      case 'A_EXECUTE':
        return 'Execute A with default trading angles.';
      case 'B_EXECUTE':
        return 'Execute B with default trading angles.';
      case 'MID_CONTROL':
        return 'Take mid control early, then flow to a site.';
      case 'ANTI_ECO':
        return 'Anti-eco: push together, buy armor, do not over-rotate.';
      case 'FORCE':
        return 'Force buy rifles now and rush the closest site.';
      case 'SAVE':
        return 'Save your weapons for the next round — avoid engagements.';
      case 'RETREAT':
        return 'Rotate off the site immediately.';
      case 'DEFAULT':
        return `[${map ?? 'this map'}] Play default positions, trade when engaged.`;
      default:
        return `Play the read and adapt.`;
    }
  }
}

function buildDetail(action: ActionType, state: MatchState, signals: TacticalSignal[]): string {
  const signalText =
    signals.length > 0 ? signals.map((s) => `${s.label}=${s.detail}`).join('; ') : 'no tactical signals yet';
  return `Deterministic "${action}" from ${signalText}.`;
}