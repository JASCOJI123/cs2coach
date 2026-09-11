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
  action: z.enum(ActionTypes),
  detail: z.string().max(300),
  priority: z.number().min(1).max(5),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  expiresAt: z.number().nullable().optional(),
});

const InstructionSchema = z.object({
  faceitPlayerId: z.string().min(1).max(64),
  nickname: z.string().min(1).max(80),
  role: z.string().max(40),
  instruction: z.string().min(1).max(200),
});

const SignalSchema = z.object({
  label: z.string().max(60),
  detail: z.string().max(200),
});

export const TacticalOutputSchema = z.object({
  recommendation: RecommendationSchema,
  instructions: z.array(InstructionSchema).max(10),
  analysis: z.string().max(600),
  signals: z.array(SignalSchema).max(10),
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
      const res = await this.groq.chat({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.4, json: true });
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
      this.logger.warn('schema_validation_failed', { issues: result.error.issues.map((i) => i.message).join('; ') });
      return { ok: false };
    }
    return { ok: true, output: result.data };
  }
}