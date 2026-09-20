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

export type TacticalLanguage = 'uz' | 'ru' | 'en';

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

const INSTRUCTIONS: Record<TacticalLanguage, Record<ActionType, string> & { default: string }> = {
  en: {
    FAST_A: 'Rush A instantly; two pop flashes then entry.',
    FAST_B: 'Rush B instantly; one smoke to cut mid.',
    SPLIT_A: 'Split A: 3 main, 2 palace/connector.',
    SPLIT_B: 'Split B: 3 tunnels, 2 mid.',
    A_EXECUTE: 'Execute A with default trading angles.',
    B_EXECUTE: 'Execute B with default trading angles.',
    MID_CONTROL: 'Take mid control early, then flow to a site.',
    ANTI_ECO: 'Anti-eco: push together, buy armor, do not over-rotate.',
    FORCE: 'Force buy rifles now and rush the closest site.',
    SAVE: 'Save your weapons for the next round — avoid engagements.',
    RETREAT: 'Rotate off the site immediately.',
    DEFAULT: '[{map}] Play default positions, trade when engaged.',
    default: 'Play the read and adapt.',
  },
  uz: {
    FAST_A: 'A ni darhol bos; ikkita flash tashlab kirib bor.',
    FAST_B: 'B ni darhol bos; midni kesish uchun bitta tutun.',
    SPLIT_A: 'A ni bo‘lib bos: 3 kishi main, 2 kishi palace/connector.',
    SPLIT_B: 'B ni bo‘lib bos: 3 kishi tunnel, 2 kishi mid.',
    A_EXECUTE: 'A ni standart trade burchaklari bilan bos.',
    B_EXECUTE: 'B ni standart trade burchaklari bilan bos.',
    MID_CONTROL: 'Avval mid nazoratini oling, keyin saytga o‘ting.',
    ANTI_ECO: 'Anti-eko: birgalikda boring, broniya oling, ortiqcha rotatsiya qilmang.',
    FORCE: 'Hozir force-buy qiling va eng yaqin saytga hujum qiling.',
    SAVE: 'Qurolni keyingi raund uchun saqlang — jangga kirmang.',
    RETREAT: 'Darhol saytdan chiqib keting.',
    DEFAULT: '[{map}] Standart pozitsiyalarda o‘ynang, uchrashganda trade qiling.',
    default: 'Vaziyatni o‘qing va moslashing.',
  },
  ru: {
    FAST_A: 'Раш на A немедленно; две флешки, затем вход.',
    FAST_B: 'Раш на B немедленно; один дым, чтобы срезать мид.',
    SPLIT_A: 'Сплит на A: 3 через мейн, 2 через дворец/коннектор.',
    SPLIT_B: 'Сплит на B: 3 через тоннели, 2 через мид.',
    A_EXECUTE: 'Заход на A со стандартными углами трейда.',
    B_EXECUTE: 'Заход на B со стандартными углами трейда.',
    MID_CONTROL: 'Сначала возьмите контроль мида, затем идите на сайт.',
    ANTI_ECO: 'Анти-эко: идите вместе, купите броню, не делайте лишних ротаций.',
    FORCE: 'Форс-бай райфлы сейчас и атакуйте ближайший сайт.',
    SAVE: 'Сохраните оружие до следующего раунда — избегайте боя.',
    RETREAT: 'Немедленно уходите с сайта.',
    DEFAULT: '[{map}] Играйте стандартные позиции, трейдайте при контакте.',
    default: 'Читайте игру и адаптируйтесь.',
  },
};

const SIGNAL_TEXT: Record<TacticalLanguage, { pattern: string; bomb: string; plantedAt: string; planted: string; economy: string; none: string }> = {
  en: { pattern: 'pattern', bomb: 'bomb', plantedAt: 'planted at', planted: 'planted', economy: 'economy', none: 'no tactical signals yet' },
  uz: { pattern: 'pattern', bomb: 'bomba', plantedAt: 'o‘rnatildi:', planted: 'o‘rnatildi', economy: 'iqtisod', none: 'hali taktik signal yo‘q' },
  ru: { pattern: 'паттерн', bomb: 'бомба', plantedAt: 'заложена на', planted: 'заложена', economy: 'экономика', none: 'тактических сигналов пока нет' },
};

const DETAIL_PREFIX: Record<TacticalLanguage, (action: ActionType, signalText: string) => string> = {
  en: (action, signalText) => `Deterministic "${action}" from ${signalText}.`,
  uz: (action, signalText) => `Deterministik "${action}" qarori: ${signalText}.`,
  ru: (action, signalText) => `Детерминированное решение «${action}»: ${signalText}.`,
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

  decide(state: MatchState, language: TacticalLanguage = 'uz'): TacticalDecision {
    const signals = this.readSignals(state, language);
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
        detail: buildDetail(action, signals, language),
        priority: URGENCY[action],
        confidence: confidenceFromScore(Math.min(1, state.opponentPatterns.length / 5)),
        timestamp: state.timestamp,
      },
      instructions: executors.map((p) => ({
        faceitPlayerId: p.faceitPlayerId,
        nickname: p.nickname,
        role: p.role,
        instruction: this.instructionFor(action, p, state.map, language),
      })),
      signals,
      deterministic: true,
    } satisfies TacticalDecision;
  }

  private readSignals(state: MatchState, language: TacticalLanguage): TacticalSignal[] {
    const text = SIGNAL_TEXT[language];
    const out: TacticalSignal[] = [];
    if (state.opponentPatterns.length > 0) {
      const top = state.opponentPatterns[0];
      out.push({ label: text.pattern, detail: `${top.location} (${top.confidence.toLowerCase()}, n=${top.sampleSize})` });
    }
    if (state.bomb.planted) {
      out.push({ label: text.bomb, detail: state.bomb.site ? `${text.plantedAt} ${state.bomb.site}` : text.planted });
    }
    if (state.economy) {
      out.push({ label: text.economy, detail: `A ${state.economy.a.buyType}, B ${state.economy.b.buyType}` });
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

  private instructionFor(action: ActionType, _player: { role: string }, map: string | undefined, language: TacticalLanguage): string {
    const dict = INSTRUCTIONS[language];
    const template = dict[action] ?? dict.default;
    return template.includes('{map}') ? template.replace('{map}', map ?? (language === 'uz' ? 'bu xarita' : language === 'ru' ? 'эта карта' : 'this map')) : template;
  }
}

function buildDetail(action: ActionType, signals: TacticalSignal[], language: TacticalLanguage): string {
  const text = SIGNAL_TEXT[language];
  const signalText = signals.length > 0 ? signals.map((s) => `${s.label}=${s.detail}`).join('; ') : text.none;
  return DETAIL_PREFIX[language](action, signalText);
}