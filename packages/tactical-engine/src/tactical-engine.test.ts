import { describe, it, expect } from 'vitest';
import { emptyMatchState, type TeamEconomy } from '@cs2coach/shared';
import { TacticalEngine } from './tactical-engine';

const engine = new TacticalEngine();

function withEconomy(a: Partial<TeamEconomy>, b: Partial<TeamEconomy>, players = 5) {
  const state = emptyMatchState('m1');
  state.map = 'de_inferno';
  state.economy = {
    a: { money: 800, armor: false, weapons: [], utility: [], lossBonus: 0, buyType: 'ECO', ...a },
    b: { money: 800, armor: false, weapons: [], utility: [], lossBonus: 0, buyType: 'ECO', ...b },
  };
  for (let i = 0; i < players; i += 1) {
    state.players.push({ faceitPlayerId: `p${i}`, nickname: `P${i}`, role: 'RIFLER', team: 'A', alive: true, hp: 100, kills: 0, deaths: 0, assists: 0, weapons: [] });
    state.alivePlayers.push({ faceitPlayerId: `p${i}`, nickname: `P${i}`, role: 'RIFLER', team: 'A', alive: true, hp: 100, kills: 0, deaths: 0, assists: 0, weapons: [] });
  }
  return state;
}

describe('TacticalEngine — deterministic fallback (spec §31)', () => {
  it('produces a decision that is marked deterministic and never invents players', () => {
    const state = withEconomy({}, {});
    const d = engine.decide(state);
    expect(d.deterministic).toBe(true);
    expect(typeof d.recommendation.action).toBe('string');
    expect(d.recommendation.priority).toBeGreaterThanOrEqual(1);
    expect(d.recommendation.priority).toBeLessThanOrEqual(5);
    expect(d.instructions.length).toBeLessThanOrEqual(5);
  });

  it('FORCE_BUY is answered with FORCE', () => {
    const state = withEconomy({ buyType: 'FORCE_BUY', money: 4200 }, {});
    expect(engine.decide(state).recommendation.action).toBe('FORCE');
  });

  it('enemy ECO is answered with ANTI_ECO', () => {
    const state = withEconomy({ buyType: 'FULL_BUY' }, { buyType: 'ECO', money: 800 });
    expect(engine.decide(state).recommendation.action).toBe('ANTI_ECO');
  });

  it('own ECO is answered with SAVE (conservative, deterministic)', () => {
    const state = withEconomy({ buyType: 'ECO', money: 800 }, {});
    expect(engine.decide(state).recommendation.action).toBe('SAVE');
  });

  it('empty roster yields no instructions (nothing fabricated)', () => {
    const state = emptyMatchState('m1');
    state.map = 'de_mirage';
    const d = engine.decide(state);
    expect(d.instructions).toEqual([]);
  });

  it('never emits an invalid ActionType', () => {
    const state = withEconomy({ buyType: 'FULL_BUY' }, { buyType: 'FULL_BUY' });
    for (let i = 0; i < 20; i += 1) {
      const action = engine.decide(state).recommendation.action;
      expect(['DEFAULT', 'A_EXECUTE', 'B_EXECUTE', 'MID_CONTROL', 'FAST_A', 'FAST_B', 'SPLIT_A', 'SPLIT_B', 'ANTI_ECO', 'FORCE', 'SAVE', 'RETREAT']).toContain(action);
    }
  });
});