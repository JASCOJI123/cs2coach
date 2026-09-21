/**
 * AiCoordinator (spec §15–§16, §42–§44, §52–§54): orchestrates game-state, AI,
 * and the deterministic tactical-engine fallback. Responsibilities:
 *  - priority queue (most urgent first)
 *  - state-hash dedup (spec §54 — never re-call Groq for unchanged state)
 *  - per-match cooldown / queue-size limits (spec §44)
 *  - Groq → TacticalEngine fallback when unavailable or failing
 */
import {
  createLogger,
  hashMatchState,
  type Logger,
  type MatchState,
} from '@cs2coach/shared';
import { TacticalEngine, type TacticalDecision, type LiveRecommendation } from '@cs2coach/tactical-engine';
import type { ValidatedTacticalOutput } from './tactical-validator';

export interface AiCoordinatorOptions {
  /** Minimum ms between AI calls for the same match. */
  cooldownMs?: number;
  /** Max pending requests across all matches. */
  maxQueueSize?: number;
}

interface PendingRequest {
  matchId: string;
  state: MatchState;
  userTeamId: 'A' | 'B';
  stateHash: string;
  language: 'uz' | 'ru' | 'en';
  resolve: (decision: TacticalDecision) => void;
  reject: (err: Error) => void;
}

export class AiCoordinator {
  private readonly cooldownMs: number;
  private readonly maxQueueSize: number;
  private readonly logger: Logger;
  private readonly lastCall = new Map<string, number>();
  private readonly seenHashes = new Set<string>();
  private readonly queue: PendingRequest[] = [];
  private processing = false;
  private readonly tacticalEngine: TacticalEngine;

  /** Pluggable validator: inject the zod-backed Groq path. */
  private validator: ((matchId: string, state: MatchState, userTeamId: 'A' | 'B', language: 'uz' | 'ru' | 'en') => Promise<ValidatedTacticalOutput | null>) | null = null;

  constructor(opts: AiCoordinatorOptions = {}, logger?: Logger) {
    this.cooldownMs = opts.cooldownMs ?? 12_000;
    this.maxQueueSize = opts.maxQueueSize ?? 12;
    this.logger = logger ?? createLogger('ai-coordinator');
    this.tacticalEngine = new TacticalEngine();
  }

  setValidator(fn: (matchId: string, state: MatchState, userTeamId: 'A' | 'B', language: 'uz' | 'ru' | 'en') => Promise<ValidatedTacticalOutput | null>): void {
    this.validator = fn;
  }

  async requestDecision(matchId: string, state: MatchState, userTeamId: 'A' | 'B', language: 'uz' | 'ru' | 'en' = 'uz'): Promise<TacticalDecision> {
    const stateHash = `${hashMatchState(state)}:${language}`;

    // Dedup identical state (spec §54) — scoped per language so switching the
    // UI language for an unchanged match state still gets a fresh, correctly
    // translated response instead of silently reusing another language's call.
    if (this.seenHashes.has(stateHash)) {
      return this.fallback(state, language, 'duplicate_state_hash');
    }

    // Rate limit (spec §44)
    const now = Date.now();
    const last = this.lastCall.get(matchId) ?? 0;
    if (now - last < this.cooldownMs) {
      return this.fallback(state, language, 'cooldown');
    }

    // Queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      return this.fallback(state, language, 'queue_full');
    }

    const decision = await new Promise<TacticalDecision>((resolve, reject) => {
      this.queue.push({ matchId, state, userTeamId, stateHash, language, resolve, reject });
    });

    this.lastCall.set(matchId, Date.now());
    return decision;
  }

  /** Drains the queue; safe to call after each event burst. */
  processNext(): boolean {
    if (this.processing) return false;
    const request = this.queue.shift();
    if (!request) return false;
    this.processing = true;
    void this.process(request);
    return true;
  }

  private async process(request: PendingRequest): Promise<void> {
    try {
      let aiResult: ValidatedTacticalOutput | null = null;
      if (this.validator) {
        aiResult = await this.validator(request.matchId, request.state, request.userTeamId, request.language);
      }
      if (!aiResult) {
        request.resolve(this.fallback(request.state, request.language, 'groq_unavailable'));
        return;
      }
      this.seenHashes.add(request.stateHash);
      request.resolve(this.toDecision(aiResult, request.state));
    } catch (err) {
      this.logger.warn('ai_process_failed', { matchId: request.matchId, error: (err as Error).message });
      request.resolve(this.fallback(request.state, request.language, 'ai_error'));
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  private fallback(state: MatchState, language: 'uz' | 'ru' | 'en', _reason: string): TacticalDecision {
    return this.tacticalEngine.decide(state, language);
  }

  private toDecision(ai: ValidatedTacticalOutput, state: MatchState): TacticalDecision {
    const rec: LiveRecommendation = {
      action: ai.recommendation.action as LiveRecommendation['action'],
      detail: ai.recommendation.detail,
      priority: ai.recommendation.priority,
      confidence: ai.recommendation.confidence,
      expiresAt: ai.recommendation.expiresAt ?? undefined,
      timestamp: state.timestamp,
    };
    const decision: TacticalDecision = {
      recommendation: rec,
      instructions: ai.instructions.map((i) => ({
        faceitPlayerId: i.faceitPlayerId,
        nickname: i.nickname,
        role: i.role,
        instruction: i.instruction,
      })),
      signals: ai.signals,
      deterministic: false,
    };
    return decision;
  }

  get queueSize(): number {
    return this.queue.length;
  }

  clearHashes(): void {
    this.seenHashes.clear();
  }
}