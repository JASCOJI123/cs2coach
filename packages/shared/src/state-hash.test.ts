import { describe, it, expect } from 'vitest';
import { hashMatchState, selectTacticalState, sha256Hex } from './state-hash';
import { emptyMatchState } from './types';

describe('state-hash', () => {
  it('sha256Hex deterministically hashes equal input', () => {
    expect(sha256Hex('same input')).toBe(sha256Hex('same input'));
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });

  it('hashMatchState is stable for equal state and differs on score change', () => {
    const a = emptyMatchState('m1');
    a.map = 'de_mirage';
    expect(hashMatchState(a)).toBe(hashMatchState({ ...a }));

    a.score.a = 5;
    expect(hashMatchState(a)).not.toBe(hashMatchState({ ...a, score: { a: 6, b: 0 } }));
  });

  it('selectTacticalState only returns decision-relevant fields', () => {
    const s = emptyMatchState('m1');
    s.map = 'de_mirage';
    s.score = { a: 3, b: 1 };
    s.round = 4;
    const out = selectTacticalState(s) as { map: string | null; score: { a: number; b: number }; round: number };
    expect(out.map).toBe('de_mirage');
    expect(out.score.a).toBe(3);
    expect(out.round).toBe(4);
  });
});