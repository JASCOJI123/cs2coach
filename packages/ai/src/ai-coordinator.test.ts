import { describe, it, expect } from 'vitest';
import { emptyMatchState } from '@cs2coach/shared';
import { AiCoordinator } from './ai-coordinator';
import type { ValidatedTacticalOutput } from './tactical-validator';

const state = () => {
  const s = emptyMatchState('m1');
  s.map = 'de_mirage';
  s.score = { a: 4, b: 2 };
  s.round = 7;
  return s;
};

const aiOutput = (): ValidatedTacticalOutput => ({
  recommendation: { action: 'B_EXECUTE', detail: 'Execute B with two smokes', priority: 2, confidence: 'HIGH', expiresAt: null },
  instructions: [{ faceitPlayerId: 'p1', nickname: 'P1', role: 'IGL', instruction: 'Smoke CT, flash yellow, entry through apartments.' }],
  analysis: 'B is underdefended given recent rotations.',
  signals: [{ label: 'rotation', detail: 'two defenders moved off B' }],
});

describe('AiCoordinator — Groq → deterministic fallback (spec §16, §54)', () => {
  it('falls back to the deterministic engine when no Groq validator is set', async () => {
    const coordinator = new AiCoordinator({ cooldownMs: 0 }, undefined);
    const pending = coordinator.requestDecision('m1', state(), 'A');
    coordinator.processNext();
    const decision = await pending;
    expect(decision.deterministic).toBe(true);
  });

  it('uses the AI path when a validator is injected', async () => {
    const coordinator = new AiCoordinator({ cooldownMs: 0 });
    coordinator.setValidator(async (_matchId, _s, _team) => aiOutput());
    const pending = coordinator.requestDecision('m1', state(), 'A');
    coordinator.processNext();
    const decision = await pending;
    expect(decision.deterministic).toBe(false);
    expect(decision.recommendation.action).toBe('B_EXECUTE');
    expect(decision.signals.length).toBe(1);
  });

  it('deduplicates identical state hashes (spec §54)', async () => {
    const coordinator = new AiCoordinator({ cooldownMs: 0 });
    let calls = 0;
    coordinator.setValidator(async (_m, _s, _t) => {
      calls += 1;
      return aiOutput();
    });
    const s = state();
    const pending = coordinator.requestDecision('m1', s, 'A');
    coordinator.processNext();
    const first = await pending;
    const second = await coordinator.requestDecision('m1', s, 'A');
    expect(first.deterministic).toBe(false); // first call used AI
    expect(calls).toBe(1); // second identical-hash call skipped Groq
    expect(second.deterministic).toBe(true); // dedup answered deterministically
  });

  it('enforces per-match cooldown (spec §44)', async () => {
    const coordinator = new AiCoordinator({ cooldownMs: 60_000 });
    coordinator.setValidator(async (_m, _s, _t) => aiOutput());
    const pending = coordinator.requestDecision('m2', state(), 'B');
    coordinator.processNext();
    await pending;
    const second = await coordinator.requestDecision('m2', state(), 'B');
    // second call within cooldown → deterministic fallback
    expect(second.deterministic).toBe(true);
  });
});