import { describe, it, expect } from 'vitest';
import { emptyMatchState, type GameEvent, type TeamEconomy } from '@cs2coach/shared';
import { MatchStateEngine } from './match-state-engine';

const ts = 0;
const base = { matchId: 'm1', ts };

function eco(money: number): TeamEconomy {
  return { money, armor: true, weapons: ['AK-47'], utility: ['HE'], lossBonus: 1400, buyType: 'FULL_BUY' };
}

describe('MatchStateEngine — NO FAKE DATA gates (spec §12, §33)', () => {
  it('never marks game data as available before real events arrive', () => {
    const engine = new MatchStateEngine();
    const state = engine.applyEvent({ type: 'match_created', ...base });
    expect(state?.gameDataAvailable).toBe(false);
  });

  it('match_started flips gameDataAvailable on and enters live phase', () => {
    const engine = new MatchStateEngine();
    engine.applyEvent({ type: 'match_created', ...base });
    const state = engine.applyEvent({ type: 'match_started', ...base, map: 'de_mirage', teams: { a: { players: [] }, b: { players: [] } } });
    expect(state?.gameDataAvailable).toBe(true);
    expect(state?.phase).toBe('live');
    expect(state?.map).toBe('de_mirage');
  });

  it('demo_mode marks BOTH demoMode and gameDataAvailable', () => {
    const engine = new MatchStateEngine();
    engine.applyEvent({ type: 'match_created', ...base });
    const state = engine.applyEvent({ type: 'demo_mode', ...base });
    expect(state?.demoMode).toBe(true);
    expect(state?.gameDataAvailable).toBe(true);
  });

  it('match_demo_ready alone does NOT imply live data is available', () => {
    const engine = new MatchStateEngine();
    engine.applyEvent({ type: 'match_created', ...base });
    const state = engine.applyEvent({ type: 'match_demo_ready', ...base });
    expect(state?.gameDataAvailable).toBe(false);
  });
});

describe('MatchStateEngine — round + economy reduction', () => {
  it('round_ended persists the economy snapshot and the round result', () => {
    const engine = new MatchStateEngine();
    engine.applyEvent({ type: 'match_created', ...base });
    engine.applyEvent({ type: 'match_started', ...base });
    const state = engine.applyEvent({
      type: 'round_ended',
      ...base,
      round: 1,
      winner: 'CT',
      reason: 'Bomb defused',
      economy: { a: eco(2900), b: eco(4200) },
    });
    expect(state?.economy?.a.money).toBe(2900);
    expect(state?.economy?.b.money).toBe(4200);
    expect(state?.previousRounds.at(-1)?.round).toBe(1);
  });

  it('player_kill removes the victim from alivePlayers', () => {
    const engine = new MatchStateEngine();
    engine.applyEvent({ type: 'match_created', ...base });
    engine.applyEvent({ type: 'match_started', ...base, teams: { a: { players: [{ faceitPlayerId: 'a1', nickname: 'A1' }] }, b: { players: [{ faceitPlayerId: 'b1', nickname: 'B1' }] } } });
    engine.applyEvent({ type: 'round_started', ...base, round: 1, side: 'CT' });
    const kill: GameEvent = { type: 'player_kill', ...base, round: 1, killer: { faceitPlayerId: 'a1', nickname: 'A1' }, victim: { faceitPlayerId: 'b1', nickname: 'B1' }, weapon: 'AK-47' };
    engine.applyEvent(kill);
    const state = engine.applyEvent({ type: 'score_updated', ...base, scoreA: 1, scoreB: 0 });
    expect(state?.alivePlayers.some((p) => p.faceitPlayerId === 'b1')).toBe(false);
    expect(state?.alivePlayers.some((p) => p.faceitPlayerId === 'a1')).toBe(true);
  });

  it('state hashes change when state changes (spec §54)', () => {
    const engine = new MatchStateEngine();
    engine.applyEvent({ type: 'match_created', ...base });
    const h1 = engine.applyEvent({ type: 'score_updated', ...base, scoreA: 1, scoreB: 0 })?.stateHash;
    const h2 = engine.applyEvent({ type: 'score_updated', ...base, scoreA: 2, scoreB: 0 })?.stateHash;
    expect(h2).not.toBe(h1);
  });

  it('emptyMatchState starts with gameDataAvailable=false and demoMode=false', () => {
    const s = emptyMatchState('m-x');
    expect(s.gameDataAvailable).toBe(false);
    expect(s.demoMode).toBe(false);
    expect(s.phase).toBe('pre_match');
  });
});