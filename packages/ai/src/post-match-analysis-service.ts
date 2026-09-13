import { GroqClient } from './groq-client';
import { postMatchAnalysisSchema, type PostMatchAnalysis } from './post-match-schema';

export interface PostMatchContext {
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

const PROMPT = `Return only JSON matching the schema.
Analyze THIS match, not a generic CS2 player.
Use every supplied numeric stat and compare the current match against the player's historical baseline when history exists.
The overallScore fields are skill ratings from 0-100: aim, positioning, decisionMaking, utility, trading, opening, clutch, teamplay.
Make each score evidence-based and different when the supplied match data differs. Do not default all skills to 50.
Identify concrete strengths and weaknesses from the actual numbers. If a metric is unavailable, do not invent it; infer only from other supplied evidence.
For bestRound/worstRound use actual round numbers only when round data supports the conclusion.
topMistakes and topDecisions must be specific to this match. trainingPlan must target the weakest evidence-based skills and may use the historical trend.
Use only supplied match data; never invent kills, events, maps, opponents, or outcomes.`;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function n(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

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
  const totalDamage = n(player.totalDamage);
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

  async generate(context: PostMatchContext): Promise<{ analysis: PostMatchAnalysis; source: 'groq' | 'fallback' }> {
    if (this.groq.available) {
      try {
        const response = await this.groq.chat({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: JSON.stringify(context) },
          ],
          temperature: 0.55,
          maxTokens: 1400,
          json: true,
        });
        return { analysis: postMatchAnalysisSchema.parse(JSON.parse(response.content)), source: 'groq' };
      } catch {
        // Fall through to deterministic, data-driven analysis.
      }
    }
    return { analysis: this.fallback(context), source: 'fallback' };
  }

  private fallback(context: PostMatchContext): PostMatchAnalysis {
    const wins = context.rounds.filter((r) => r.winner === 'A' || r.winner === 'team_a').length;
    const total = Math.max(context.rounds.length, 1);
    const baseline = Math.max(40, Math.min(70, Math.round(45 + (wins / total) * 25)));
    const score = scoreFromStats(context.player);
    const entries = Object.entries(score).sort((a, b) => a[1] - b[1]);
    const weakest = entries.slice(0, 2).map(([key]) => key);
    const strongest = entries.slice(-2).reverse().map(([key]) => key);
    const best = context.rounds.find((r) => r.winner === 'A' || r.winner === 'team_a');
    const worst = context.rounds.find((r) => r.winner === 'B' || r.winner === 'team_b');
    const map = context.map ?? 'the played map';

    return {
      overallScore: {
        ...score,
        decisionMaking: Math.max(score.decisionMaking, baseline),
      },
      bestRound: best && typeof best.roundNumber === 'number' ? { roundNumber: best.roundNumber, reason: 'Round win supported by the recorded round result; event detail is limited.' } : null,
      worstRound: worst && typeof worst.roundNumber === 'number' ? { roundNumber: worst.roundNumber, reason: 'Round loss supported by the recorded round result; event detail is limited.' } : null,
      topMistakes: [
        `Priority weakness: ${weakest[0] ?? 'decision making'} based on this match's supplied statistics.`,
        weakest[1] ? `Secondary weakness: ${weakest[1]}; focus on measurable improvement rather than generic drills.` : 'Review the rounds with the largest impact on the final score.',
      ],
      topDecisions: [
        `Strongest area: ${strongest[0] ?? 'aim'} according to the supplied match statistics.`,
        strongest[1] ? `Secondary strength: ${strongest[1]}. Preserve this while improving the weakest area.` : 'The available statistics show a positive contribution in the strongest measured area.',
      ],
      opponentPatterns: context.opponentPatterns.slice(0, 5),
      trainingPlan: [
        { day: 1, focus: `Improve ${weakest[0] ?? 'decision making'} using the current match as the baseline.` },
        { day: 2, focus: `Practice ${weakest[1] ?? 'utility'} on ${map}.` },
        { day: 3, focus: `Repeat the strongest habit (${strongest[0] ?? 'aim'}) while reducing the main weakness.` },
      ],
    };
  }
}
