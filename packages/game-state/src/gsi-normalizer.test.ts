import { describe, expect, it } from 'vitest';
import { normalizeGsiSnapshot, readGsiSnapshot } from './gsi-normalizer';

describe('GSI snapshot normalization', () => {
  it('uses explicit map.round instead of deriving round from score', () => {
    const s = readGsiSnapshot({ map: { round: 17, team_ct: { score: 8 }, team_t: { score: 8 } }, round: { phase: 'live' } });
    expect(s.round).toBe(17);
  });

  it('emits round/bomb edges once when snapshots repeat', () => {
    const first = readGsiSnapshot({ map: { round: 4, team_ct: { score: 3 }, team_t: { score: 0 } }, round: { phase: 'freezetime' } });
    const next = { map: { round: 4, team_ct: { score: 3 }, team_t: { score: 0 } }, round: { phase: 'over', win_team: 'CT', bomb: 'planted' } };
    const events1 = normalizeGsiSnapshot('m1', next, first);
    const events2 = normalizeGsiSnapshot('m1', next, readGsiSnapshot(next));
    expect(events1).toHaveLength(2);
    expect(events1.map((e) => e.type)).toEqual(['round_ended', 'bomb_state']);
    expect(events2).toHaveLength(0);
  });

  it('normalizes score changes into domain score events', () => {
    const previous = readGsiSnapshot({ map: { round: 5, team_ct: { score: 2 }, team_t: { score: 2 } }, round: { phase: 'live' } });
    const events = normalizeGsiSnapshot('m1', { map: { round: 6, team_ct: { score: 3 }, team_t: { score: 2 } }, round: { phase: 'freezetime' } }, previous) as any[];
    expect(events.some((e) => e.type === 'score_updated' && e.scoreA === 3 && e.scoreB === 2)).toBe(true);
  });
});
