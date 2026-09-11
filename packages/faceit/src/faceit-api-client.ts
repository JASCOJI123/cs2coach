/**
 * Centralized FACEIT API client (spec §13).
 * Every FACEIT request must go through this class: timeout, retry with backoff,
 * 429 rate-limit handling with Retry-After, TTL caching for GETs, and logging.
 * Route handlers never call FACEIT directly.
 */
import { AppError, codes, createLogger, sleep, type Logger } from '@cs2coach/shared';
import type {
  FaceitCs2Stats,
  FaceitMatchDetail,
  FaceitMatchListItem,
  FaceitPlayerHistory,
  FaceitPlayerCore,
} from './types';

/** Body payload accepted by `fetch` — avoids depending on DOM lib types. */
export type FetchBody = string | URLSearchParams | null;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

class TtlCache {
  private map = new Map<string, CacheEntry>();

  get(key: string, _ttlMs: number): unknown | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.map.set(key, { expiresAt: Date.now() + ttlMs, value });
    if (this.map.size > 500) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest) this.map.delete(oldest);
    }
  }
}

export interface FaceitApiClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  cacheTtlMs?: number;
  logger?: Logger;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class FaceitApiClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly cacheTtlMs: number;
  private readonly logger: Logger;
  private readonly cache = new TtlCache();

  constructor(opts: FaceitApiClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? 'https://open.faceit.com/data/v4';
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.cacheTtlMs = opts.cacheTtlMs ?? 60_000;
    this.logger = opts.logger ?? createLogger('faceit-client');
  }

  hasApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  private cacheKey(method: string, path: string, query?: URLSearchParams): string {
    return `${method} ${path}?${query?.toString() ?? ''}`;
  }

  async get<T>(path: string, query?: Record<string, string | number | undefined>, opts?: { ttlMs?: number }): Promise<T> {
    return this.request<T>('GET', path, { query, ttlMs: opts?.ttlMs });
  }

  async post<T>(path: string, body?: URLSearchParams | object, authBearer?: string): Promise<T> {
    return this.request<T>('POST', path, { body, authBearer });
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    ctx: {
      query?: Record<string, string | number | undefined>;
      body?: URLSearchParams | object;
      authBearer?: string;
      ttlMs?: number;
    },
  ): Promise<T> {
    if (!this.apiKey && !ctx.authBearer) {
      throw new AppError(codes.missingEnv, 'FACEIT_API_KEY is not configured', 500);
    }

    const url = new URL(path, this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
    if (ctx.query) {
      for (const [key, value] of Object.entries(ctx.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const isCacheableGet = method === 'GET';
    if (isCacheableGet) {
      const cached = this.cache.get(this.cacheKey(method, url.toString()), ctx.ttlMs ?? this.cacheTtlMs);
      if (cached !== undefined) return cached as T;
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'cs2-ai-coach/0.1',
    };

    if (ctx.authBearer) {
      headers.Authorization = `Bearer ${ctx.authBearer}`;
    } else if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    let bodyData: FetchBody | undefined;
    if (ctx.body) {
      if (ctx.body instanceof URLSearchParams) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        bodyData = ctx.body;
      } else {
        headers['Content-Type'] = 'application/json';
        bodyData = JSON.stringify(ctx.body);
      }
    }

    /** Body payload accepted by `fetch` — avoids depending on DOM lib types. */
    type FetchBody = string | URLSearchParams | null;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const started = Date.now();
      try {
        const res = await this.rawFetch(url.toString(), { method, headers, body: bodyData });
        const duration = Date.now() - started;

        if (res.status === 429) {
          const retryAfterMs = this.parseRetryAfter(res.headers.get('retry-after'), 1_000);
          this.logger.warn('faceit_rate_limited', { path, attempt, retryAfterMs });
          await sleep(Math.min(retryAfterMs, 15_000));
          if (attempt < this.maxRetries) continue;
          throw new AppError(codes.rateLimited, 'FACEIT rate limit exceeded', 429);
        }

        if (RETRYABLE_STATUS.has(res.status)) {
          const delay = Math.min(500 * 2 ** attempt, 4_000);
          this.logger.warn('faceit_retry', { path, status: res.status, attempt, duration });
          if (attempt < this.maxRetries) {
            await sleep(delay);
            continue;
          }
          throw new AppError(codes.upstreamError, `FACEIT returned ${res.status}`, 503);
        }

        const text = await res.text();
        if (res.status >= 400) {
          this.logger.warn('faceit_error', { path, status: res.status, duration });
          throw new AppError(this.mapStatus(res.status), `FACEIT ${method} ${path} failed (${res.status})`, res.status);
        }

        const parsed = text ? (JSON.parse(text) as T) : (undefined as unknown as T);
        if (isCacheableGet) {
          this.cache.set(this.cacheKey(method, url.toString()), parsed, ctx.ttlMs ?? this.cacheTtlMs);
        }
        return parsed;
      } catch (err) {
        lastError = err;
        if (err instanceof AppError) throw err; // already mapped
        const timeoutish = err instanceof Error && err.name === 'TimeoutError';
        const delay = Math.min(500 * 2 ** attempt, 4_000);
        this.logger.warn('faceit_network_error', { path, attempt, error: timeoutish ? 'timeout' : err instanceof Error ? err.message : String(err) });
        if (attempt < this.maxRetries) {
          await sleep(delay);
          continue;
        }
        throw new AppError(
          timeoutish ? codes.upstreamTimeout : codes.upstreamError,
          timeoutish ? 'FACEIT request timed out' : 'FACEIT upstream error',
          timeoutish ? 504 : 503,
          lastError instanceof Error ? { cause: lastError.message } : undefined,
        );
      }
    }
    throw new AppError(codes.upstreamError, 'FACEIT upstream error', 503, lastError instanceof Error ? { cause: lastError.message } : undefined);
  }

  private async rawFetch(url: string, init: { method: string; headers: Record<string, string>; body?: FetchBody }): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, headers: init.headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private parseRetryAfter(value: string | null, fallbackMs: number): number {
    if (!value) return fallbackMs;
    const seconds = Number.parseInt(value, 10);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    return fallbackMs;
  }

  private mapStatus(status: number): string {
    if (status === 401) return 'FACEIT_UNAUTHORIZED';
    if (status === 403) return 'FACEIT_FORBIDDEN';
    if (status === 404) return 'FACEIT_NOT_FOUND';
    return 'FACEIT_ERROR';
  }

  // ── typed endpoints ────────────────────────────────────────────────────────

  getPlayerByNickname(nickname: string): Promise<FaceitPlayerCore> {
    return this.get<FaceitPlayerCore>(`/players`, { nickname });
  }

  getPlayerById(playerId: string): Promise<FaceitPlayerCore> {
    return this.get<FaceitPlayerCore>(`/players/${encodeURIComponent(playerId)}`);
  }

  getPlayerMatches(
    playerId: string,
    opts?: { offset?: number; limit?: number; fromMs?: number; toMs?: number },
  ): Promise<FaceitPlayerHistory> {
    return this.get<FaceitPlayerHistory>(`/players/${encodeURIComponent(playerId)}/history`, {
      game: 'cs2',
      offset: opts?.offset ?? 0,
      limit: opts?.limit ?? 20,
      from: opts?.fromMs ? Math.floor(opts.fromMs / 1000) : undefined,
      to: opts?.toMs ? Math.floor(opts.toMs / 1000) : undefined,
    });
  }

  getPlayerStatsCs2(playerId: string): Promise<FaceitCs2Stats> {
    return this.get<FaceitCs2Stats>(`/players/${encodeURIComponent(playerId)}/stats/cs2`, undefined, { ttlMs: 5 * 60_000 });
  }

  getMatchById(matchId: string): Promise<FaceitMatchDetail> {
    return this.get<FaceitMatchDetail>(`/matches/${encodeURIComponent(matchId)}`, undefined, { ttlMs: 30_000 });
  }

  getMatchListByIds(ids: string[]): Promise<FaceitMatchListItem[]> {
    return this.get<FaceitMatchListItem[]>(`/matches`, { ids: ids.join(',') }, { ttlMs: 30_000 });
  }
}