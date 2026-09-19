/**
 * Zod schema + retry logic (spec §16) for Groq output. Validates the JSON
 * exactly once, retries once with a relaxed prompt on parse/schemabreak, then
 * falls back to null (triggering deterministic tactics).
 */
import { z } from 'zod';
import { createLogger, type Logger } from '@cs2coach/shared';
import type { GroqChatMessage, GroqClient, GroqResponse } from './groq-client';
import { buildTacticalPrompt, type TacticalPromptInput } from './tactical-prompt';

const ActionTypes = [
  'DEFAULT', 'A_EXECUTE', 'B_EXECUTE', 'MID_CONTROL', 'FAST_A', 'FAST_B',
  'SPLIT_A', 'SPLIT_B', 'ANTI_ECO', 'FORCE', 'SAVE', 'RETREAT',
] as const;

const RecommendationSchema = z.object({
  action: z.enum(ActionTypes).default('DEFAULT'),
  detail: z.string().max(300).catch('Tactical recommendation unavailable.'),
  priority: z.number().min(1).max(5).catch(3),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).catch('MEDIUM'),
  expiresAt: z.number().nullable().optional().default(null),
}).default({ action: 'DEFAULT', detail: 'Tactical recommendation unavailable.', priority: 3, confidence: 'MEDIUM', expiresAt: null });

const InstructionSchema = z.object({
  faceitPlayerId: z.string().min(1).max(64).catch('unknown'),
  nickname: z.string().min(1).max(80).catch('Player'),
  role: z.string().max(40).catch('RIFLER'),
  instruction: z.string().min(1).max(200).catch('Play according to the current tactical situation.'),
});

const SignalSchema = z.object({
  label: z.string().max(60).catch('signal'),
  detail: z.string().max(200).catch('unavailable'),
});

export const TacticalOutputSchema = z.object({
  recommendation: RecommendationSchema,
  instructions: z.array(InstructionSchema).max(10).catch([]),
  analysis: z.string().max(600).catch('Live tactical analysis is temporarily unavailable.'),
  signals: z.array(SignalSchema).max(10).catch([]),
}).catch({
  recommendation: { action: 'DEFAULT', detail: 'Tactical recommendation unavailable.', priority: 3, confidence: 'MEDIUM', expiresAt: null },
  instructions: [],
  analysis: 'Live tactical analysis is temporarily unavailable.',
  signals: [],
});

export type ValidatedTacticalOutput = z.infer<typeof TacticalOutputSchema>;

export class TacticalAIValidator {
  private readonly logger: Logger;

  constructor(private readonly groq: GroqClient, logger?: Logger) {
    this.logger = logger ?? createLogger('ai-validator');
  }

  /**
   * Ask Groq for a tactical decision, validate, retry once on parse failure,
   * then return null (signalling fallback) if validation fails.
   */
  async requestTactical(input: TacticalPromptInput): Promise<ValidatedTacticalOutput | null> {
    if (!this.groq.available) return null;

    const messages = buildTacticalPrompt(input);
    const first = await this.callGroq(messages);
    if (first.ok) return first.output;

    // Retry with a stricter prompt
    const retryMessages: GroqChatMessage[] = [
      messages[0],
      messages[1],
      {
        role: 'user',
        content: 'Return ONLY valid JSON matching the required shape exactly. Do not wrap in markdown.',
      },
    ];
    const second = await this.callGroq(retryMessages);
    return second.ok ? second.output : null;
  }

  private async callGroq(messages: GroqChatMessage[]): Promise<{ ok: true; output: ValidatedTacticalOutput } | { ok: false }> {
    try {
      const res = await this.groq.chat({ model: 'openai/gpt-oss-120b', messages, temperature: 0.4, json: true });
      return this.parseJson(res);
    } catch (err) {
      this.logger.warn('groq_call_failed', { error: (err as Error).message });
      return { ok: false };
    }
  }

  private parseJson(res: GroqResponse): { ok: true; output: ValidatedTacticalOutput } | { ok: false } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.content);
    } catch {
      this.logger.warn('json_parse_failed', { snippet: res.content.slice(0, 120) });
      return { ok: false };
    }
    const result = TacticalOutputSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn('schema_validation_failed', { issues: result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ') });
      return { ok: false };
    }
    return { ok: true, output: result.data };
  }
}