import { GroqClient } from './groq-client';
import { postMatchAnalysisSchema, type PostMatchAnalysis } from './post-match-schema';

export interface PostMatchContext {
  map: string | null;
  finalScore: { a: number; b: number };
  player: Record<string, number | string>;
  rounds: Array<Record<string, unknown>>;
  opponentPatterns: string[];
}

const PROMPT = 'Return only JSON with overallScore (aim, positioning, decisionMaking, utility, trading, opening, clutch, teamplay; 0-100), bestRound, worstRound, topMistakes (max 3), topDecisions (max 3), opponentPatterns (max 5), and trainingPlan (1-7 days). Use only supplied match data; do not invent facts.';

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
          temperature: 0.35,
          maxTokens: 1100,
          json: true,
        });
        return { analysis: postMatchAnalysisSchema.parse(JSON.parse(response.content)), source: 'groq' };
      } catch {
        // Fall through to deterministic analysis.
      }
    }
    return { analysis: this.fallback(context), source: 'fallback' };
  }

  private fallback(context: PostMatchContext): PostMatchAnalysis {
    const wins = context.rounds.filter((r) => r.winner === 'A' || r.winner === 'team_a').length;
    const total = Math.max(context.rounds.length, 1);
    const baseline = Math.max(40, Math.min(70, Math.round(45 + (wins / total) * 25)));
    const best = context.rounds.find((r) => r.winner === 'A' || r.winner === 'team_a');
    const worst = context.rounds.find((r) => r.winner === 'B' || r.winner === 'team_b');
    return {
      overallScore: { aim: baseline, positioning: 50, decisionMaking: baseline, utility: 50, trading: baseline, opening: 50, clutch: 50, teamplay: baseline },
      bestRound: best && typeof best.roundNumber === 'number' ? { roundNumber: best.roundNumber, reason: 'Round won; available event data is not detailed enough for a specific conclusion.' } : null,
      worstRound: worst && typeof worst.roundNumber === 'number' ? { roundNumber: worst.roundNumber, reason: 'Round lost; available event data is not detailed enough for a specific conclusion.' } : null,
      topMistakes: ['Detailed event data is limited; review positioning and utility decisions from the recorded rounds.'],
      topDecisions: ['Round results were recorded; deeper decision analysis needs richer event data.'],
      opponentPatterns: context.opponentPatterns.slice(0, 5),
      trainingPlan: [
        { day: 1, focus: 'Review opening duels from this match' },
        { day: 2, focus: `Review ${context.map ?? 'the played map'} positioning` },
        { day: 3, focus: 'Practice utility timing and spacing' },
      ],
    };
  }
}
