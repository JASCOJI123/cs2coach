/**
 * GroqClient (spec §15): thin, typed client for Groq's chat completions with a
 * timeout, bounded retries, and JSON output. It never invents content — the
 * prompt layer passes a `DATA_UNAVAILABLE` instruction so the model cannot
 * fabricate live game data.
 */
import {
  AppError,
  codes,
  createLogger,
  sleep,
  type Logger,
} from '@cs2coach/shared';

export interface GroqChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface GroqRequest {
  model: string;
  messages: GroqChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface GroqResponse {
  content: string;
  raw?: unknown;
}

export interface GroqClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class GroqClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;

  constructor(opts: GroqClientOptions, logger?: Logger) {
    // A missing/placeholder key is allowed at construction so the app boots and
    // the deterministic tactical engine takes over (spec §16, §31 fallback);
    // `available` is false in that case and no request is ever made.
    this.apiKey = opts.apiKey ?? '';
    this.baseUrl = opts.baseUrl ?? 'https://api.groq.com/openai/v1';
    this.model = opts.model ?? 'llama-3.3-70b-versatile';
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.logger = logger ?? createLogger('groq');
  }

  get available(): boolean {
    return Boolean(this.apiKey) && this.apiKey !== 'sk-placeholder';
  }

  async chat(request: GroqRequest): Promise<GroqResponse> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.post(request);
      } catch (err) {
        const isRetryable =
          err instanceof AppError &&
          (err.code === codes.rateLimited || err.code === codes.upstreamError || err.code === codes.upstreamTimeout);
        if (!isRetryable || attempt >= this.maxRetries) throw err;
        const waitMs = 250 * attempt;
        this.logger.warn('groq_retry', { attempt, waitMs, error: err.message });
        await sleep(waitMs);
      }
    }
  }

  private async post(request: GroqRequest): Promise<GroqResponse> {
    const body: Record<string, unknown> = {
      model: request.model || this.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.4,
      max_tokens: request.maxTokens ?? 800,
    };
    if (request.json) body['response_format'] = { type: 'json_object' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 429) throw new AppError(codes.rateLimited, `Groq rate limited (${res.status})`);
      if (res.status >= 500) throw new AppError(codes.upstreamError, `Groq upstream error (${res.status})`);
      if (!res.ok) throw new AppError(codes.badRequest, `Groq rejected request (${res.status})`);

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? '';
      return { content, raw: data };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AppError(codes.upstreamTimeout, `Groq timeout after ${this.timeoutMs}ms`);
      }
      throw new AppError(codes.upstreamError, `Groq network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}