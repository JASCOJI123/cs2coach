import { GroqClient } from './groq-client';
import { postMatchAnalysisSchema, type PostMatchAnalysis } from './post-match-schema';

export interface PostMatchContext {
  language?: 'uz' | 'ru' | 'en';
  map: string | null;
  finalScore: { a: number; b: number };
  player: Record<string, number | string | null>;
  rounds: Array<Record<string, unknown>>;
  opponentPatterns: string[];
  history: {
    sampleSize: number;
    averages: Record<string, number | null>;
    recentFive: Array<Record<string, unknown>>;
    previousFive: Array<Record<string, unknown>>;
    trend: Record<string, number | null>;
    maps: Record<string, number>;
  };
}

const PROMPT = `Return one JSON object matching the schema exactly.
Analyze THIS match, not a generic CS2 player.
Write all human-readable analysis fields in the requested language (Uzbek Latin, Russian, or English). Keep numeric fields, day numbers, and schema keys unchanged.
Use every supplied numeric stat and compare the current match against the player's historical baseline when history exists.
The overallScore fields are skill ratings from 0-100: aim, positioning, decisionMaking, utility, trading, opening, clutch, teamplay.
Make each score evidence-based and different when the supplied match data differs. Do not default all skills to 50.
Identify concrete strengths and weaknesses from the actual numbers. If a metric is unavailable, do not invent it; infer only from other supplied evidence.
For bestRound/worstRound use actual round numbers only when round data supports the conclusion.
IMPORTANT: topMistakes, topDecisions, opponentPatterns, and trainingPlan MUST be JSON ARRAYS, never objects.
topMistakes and topDecisions must be specific to this match. trainingPlan must target the weakest evidence-based skills and may use the historical trend.
Use only supplied match data; never invent kills, events, maps, opponents, or outcomes.`;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function n(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown, max: number): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : item == null ? '' : JSON.stringify(item)))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, max);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .flatMap((item) => Array.isArray(item) ? item : [item])
      .map((item) => (typeof item === 'string' ? item : item == null ? '' : JSON.stringify(item)))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, max);
  }
  return [];
}

function trainingPlanArray(value: unknown): Array<{ day: number; focus: string }> {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>;
          const day = typeof row.day === 'number' ? row.day : index + 1;
          const focus = typeof row.focus === 'string' ? row.focus.trim() : '';
          return { day, focus };
        }
        return { day: index + 1, focus: typeof item === 'string' ? item.trim() : '' };
      })
      .filter((item) => item.focus.length > 0 && item.day >= 1 && item.day <= 7)
      .slice(0, 7);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.focus === 'string') {
      return [{ day: typeof obj.day === 'number' ? obj.day : 1, focus: obj.focus.trim() }]
        .filter((item) => item.focus.length > 0 && item.day >= 1 && item.day <= 7);
    }
    return Object.entries(obj).map(([key, item], index) => {
      const dayMatch = key.match(/\d+/);
      const day = dayMatch ? Number(dayMatch[0]) : index + 1;
      const focus = typeof item === 'string'
        ? item.trim()
        : item && typeof item === 'object' && typeof (item as Record<string, unknown>).focus === 'string'
          ? String((item as Record<string, unknown>).focus).trim()
          : '';
      return { day, focus };
    }).filter((item) => item.focus.length > 0 && item.day >= 1 && item.day <= 7).slice(0, 7);
  }
  return [];
}

function parseGroqAnalysis(content: string): PostMatchAnalysis {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const root = parsed && typeof parsed.analysis === 'object' && parsed.analysis !== null
    ? parsed.analysis as Record<string, unknown>
    : parsed;

  const normalized = {
    ...root,
    topMistakes: stringArray(root.topMistakes, 3),
    topDecisions: stringArray(root.topDecisions, 3),
    opponentPatterns: stringArray(root.opponentPatterns, 5),
    trainingPlan: trainingPlanArray(root.trainingPlan),
  };

  return postMatchAnalysisSchema.parse(normalized);
}

type SkillKey = keyof PostMatchAnalysis['overallScore'];
type Lang = 'uz' | 'ru' | 'en';

const SKILL_NAMES: Record<Lang, Record<SkillKey, string>> = {
  en: { aim: 'aim', positioning: 'positioning', decisionMaking: 'decision making', utility: 'utility usage', trading: 'trading kills', opening: 'opening duels', clutch: 'clutch rounds', teamplay: 'teamplay' },
  uz: { aim: 'nishonga olish', positioning: 'pozitsiyalanish', decisionMaking: 'qaror qabul qilish', utility: 'granata ishlatish', trading: 'trade kill', opening: 'opening duellar', clutch: 'clutch raundlar', teamplay: 'jamoaviy o‘yin' },
  ru: { aim: 'прицеливание', positioning: 'позиционирование', decisionMaking: 'принятие решений', utility: 'использование утилити', trading: 'трейд-киллы', opening: 'опенинг-дуэли', clutch: 'клатч-раунды', teamplay: 'командная игра' },
};

const FALLBACK_TEXT: Record<Lang, {
  bestRoundReason: string;
  worstRoundReason: string;
  priorityWeakness: (skill: string) => string;
  secondaryWeakness: (skill: string) => string;
  secondaryWeaknessFallback: string;
  strongestArea: (skill: string) => string;
  secondaryStrength: (skill: string) => string;
  secondaryStrengthFallback: string;
  day1: (skill: string) => string;
  day2: (skill: string, map: string) => string;
  day3: (skill: string) => string;
}> = {
  en: {
    bestRoundReason: 'Round win supported by the recorded round result; event detail is limited.',
    worstRoundReason: 'Round loss supported by the recorded round result; event detail is limited.',
    priorityWeakness: (s) => `Priority weakness: ${s} based on this match's supplied statistics.`,
    secondaryWeakness: (s) => `Secondary weakness: ${s}; focus on measurable improvement rather than generic drills.`,
    secondaryWeaknessFallback: 'Review the rounds with the largest impact on the final score.',
    strongestArea: (s) => `Strongest area: ${s} according to the supplied match statistics.`,
    secondaryStrength: (s) => `Secondary strength: ${s}. Preserve this while improving the weakest area.`,
    secondaryStrengthFallback: 'The available statistics show a positive contribution in the strongest measured area.',
    day1: (s) => `Improve ${s} using the current match as the baseline.`,
    day2: (s, m) => `Practice ${s} on ${m}.`,
    day3: (s) => `Repeat the strongest habit (${s}) while reducing the main weakness.`,
  },
  uz: {
    bestRoundReason: 'Raund yutug‘i yozilgan raund natijasiga asoslangan; batafsil hodisa ma’lumoti cheklangan.',
    worstRoundReason: 'Raund mag‘lubiyati yozilgan raund natijasiga asoslangan; batafsil hodisa ma’lumoti cheklangan.',
    priorityWeakness: (s) => `Asosiy zaif tomon: ${s} — shu match statistikasiga asoslangan.`,
    secondaryWeakness: (s) => `Qo‘shimcha zaif tomon: ${s}; umumiy mashqlar emas, o‘lchanadigan yaxshilanishga e’tibor bering.`,
    secondaryWeaknessFallback: 'Yakuniy hisobga eng ko‘p ta’sir qilgan raundlarni qayta ko‘rib chiqing.',
    strongestArea: (s) => `Eng kuchli tomon: ${s} — match statistikasiga ko‘ra.`,
    secondaryStrength: (s) => `Qo‘shimcha kuchli tomon: ${s}. Eng zaif tomonni yaxshilayotganda buni saqlab qoling.`,
    secondaryStrengthFallback: 'Mavjud statistika eng kuchli o‘lchangan sohada ijobiy hissa ko‘rsatmoqda.',
    day1: (s) => `Shu matchni asos qilib, ${s} ko‘nikmasini rivojlantiring.`,
    day2: (s, m) => `${m} xaritasida ${s} ustida mashq qiling.`,
    day3: (s) => `Eng kuchli odatni (${s}) takrorlang, asosiy zaif tomonni kamaytiring.`,
  },
  ru: {
    bestRoundReason: 'Победа в раунде подтверждена записанным результатом раунда; детали события ограничены.',
    worstRoundReason: 'Поражение в раунде подтверждено записанным результатом раунда; детали события ограничены.',
    priorityWeakness: (s) => `Главная слабость: ${s} — на основе статистики этого матча.`,
    secondaryWeakness: (s) => `Вторичная слабость: ${s}; сосредоточьтесь на измеримом улучшении, а не на общих упражнениях.`,
    secondaryWeaknessFallback: 'Пересмотрите раунды, оказавшие наибольшее влияние на итоговый счёт.',
    strongestArea: (s) => `Сильнейшая сторона: ${s} — согласно статистике матча.`,
    secondaryStrength: (s) => `Вторичная сильная сторона: ${s}. Сохраняйте её, улучшая самую слабую область.`,
    secondaryStrengthFallback: 'Доступная статистика показывает положительный вклад в сильнейшей измеренной области.',
    day1: (s) => `Улучшайте «${s}», используя этот матч как отправную точку.`,
    day2: (s, m) => `Тренируйте «${s}» на карте ${m}.`,
    day3: (s) => `Повторяйте сильную привычку (${s}), одновременно снижая основную слабость.`,
  },
};

function scoreFromStats(player: PostMatchContext['player']): PostMatchAnalysis['overallScore'] {
  const kills = n(player.kills) ?? 0;
  const deaths = n(player.deaths) ?? 0;
  const assists = n(player.assists) ?? 0;
  const adr = n(player.adr);
  const hs = n(player.headshotsPercent);
  const openingKills = n(player.openingKills) ?? 0;
  const openingDeaths = n(player.openingDeaths) ?? 0;
  const utility = n(player.utilityDamage);
  const flash = n(player.flashAssists) ?? 0;
  const clutches = n(player.clutches) ?? 0;
  const kd = deaths > 0 ? kills / deaths : kills;
  const openingTotal = openingKills + openingDeaths;
  const openingRate = openingTotal > 0 ? openingKills / openingTotal : 0.5;

  return {
    aim: clamp(45 + (kd - 1) * 28 + (adr == null ? 0 : (adr - 75) * 0.35) + (hs == null ? 0 : (hs - 35) * 0.2)),
    positioning: clamp(58 + (deaths - kills) * -3 + (adr == null ? 0 : (adr - 75) * 0.15)),
    decisionMaking: clamp(48 + assists * 3 + (adr == null ? 0 : (adr - 75) * 0.15) + clutches * 4),
    utility: clamp(40 + (utility == null ? 0 : utility * 0.55) + flash * 4),
    trading: clamp(45 + assists * 4 + flash * 3 - Math.max(0, openingDeaths - openingKills) * 2),
    opening: clamp(35 + openingRate * 55 + Math.min(openingKills, 5) * 2),
    clutch: clamp(42 + clutches * 9 + (clutches > 0 ? kd * 3 : 0)),
    teamplay: clamp(45 + assists * 4 + flash * 5),
  };
}

export class PostMatchAnalysisService {
  constructor(private readonly groq: GroqClient) {}

  async generate(context: PostMatchContext): Promise<{ analysis: PostMatchAnalysis & { source: 'groq' | 'fallback' }; source: 'groq' | 'fallback' }> {
    if (this.groq.available) {
      try {
        const languageName = context.language === 'ru' ? 'Russian' : context.language === 'en' ? 'English' : 'Uzbek (Latin)';
        const response = await this.groq.chat({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: `${PROMPT}\nRequested output language: ${languageName}.` },
            { role: 'user', content: JSON.stringify(context) },
          ],
          temperature: 0.55,
          maxTokens: 1400,
          json: true,
        });
        const analysis = parseGroqAnalysis(response.content);
        return { analysis: { ...analysis, source: 'groq' }, source: 'groq' };
      } catch (error) {
        console.warn('post_match_groq_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      console.warn('post_match_groq_unavailable', { reason: 'GROQ_API_KEY is missing or placeholder' });
    }
    return { analysis: { ...this.fallback(context), source: 'fallback' }, source: 'fallback' };
  }

  private fallback(context: PostMatchContext): PostMatchAnalysis {
    const lang: Lang = context.language ?? 'uz';
    const text = FALLBACK_TEXT[lang];
    const names = SKILL_NAMES[lang];
    const wins = context.rounds.filter((r) => r.winner === 'A' || r.winner === 'team_a').length;
    const total = Math.max(context.rounds.length, 1);
    const baseline = Math.max(40, Math.min(70, Math.round(45 + (wins / total) * 25)));
    const score = scoreFromStats(context.player);
    const entries = Object.entries(score) as [SkillKey, number][];
    const sorted = [...entries].sort((a, b) => a[1] - b[1]);
    const weakest = sorted.slice(0, 2).map(([key]) => key);
    const strongest = sorted.slice(-2).reverse().map(([key]) => key);
    const weakestNames = weakest.map((key) => names[key]);
    const strongestNames = strongest.map((key) => names[key]);
    const best = context.rounds.find((r) => r.winner === 'A' || r.winner === 'team_a');
    const worst = context.rounds.find((r) => r.winner === 'B' || r.winner === 'team_b');
    const map = context.map ?? (lang === 'uz' ? 'o‘ynalgan xarita' : lang === 'ru' ? 'сыгранной карте' : 'the played map');

    return {
      overallScore: {
        ...score,
        decisionMaking: Math.max(score.decisionMaking, baseline),
      },
      bestRound: best && typeof best.roundNumber === 'number' ? { roundNumber: best.roundNumber, reason: text.bestRoundReason } : null,
      worstRound: worst && typeof worst.roundNumber === 'number' ? { roundNumber: worst.roundNumber, reason: text.worstRoundReason } : null,
      topMistakes: [
        text.priorityWeakness(weakestNames[0] ?? names.decisionMaking),
        weakestNames[1] ? text.secondaryWeakness(weakestNames[1]) : text.secondaryWeaknessFallback,
      ],
      topDecisions: [
        text.strongestArea(strongestNames[0] ?? names.aim),
        strongestNames[1] ? text.secondaryStrength(strongestNames[1]) : text.secondaryStrengthFallback,
      ],
      opponentPatterns: context.opponentPatterns.slice(0, 5),
      trainingPlan: [
        { day: 1, focus: text.day1(weakestNames[0] ?? names.decisionMaking) },
        { day: 2, focus: text.day2(weakestNames[1] ?? names.utility, map) },
        { day: 3, focus: text.day3(strongestNames[0] ?? names.aim) },
      ],
    };
  }
}
