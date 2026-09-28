import { observeTick, type DeathTrackerMemory } from './death-tracker';

const ME = '7656119800000001';
const MATE = '7656119800000002';

function tick(opts: { phase: string; steamid?: string; health?: number; position?: string; score?: [number, number]; win?: 'CT' | 'T'; mapPhase?: string }) {
  return {
    provider: { steamid: ME },
    map: { phase: opts.mapPhase ?? 'live', team_ct: { score: opts.score?.[0] ?? 3 }, team_t: { score: opts.score?.[1] ?? 2 } },
    round: { phase: opts.phase, win_team: opts.win },
    player: {
      steamid: opts.steamid ?? ME,
      team: 'CT',
      position: opts.position ?? '-100.5, 200.0, -160.0',
      state: { health: opts.health ?? 100 },
      weapons: { weapon_0: { name: 'weapon_knife', state: 'holstered' }, weapon_1: { name: 'weapon_ak47', state: 'active' } },
    },
  };
}

describe('death tracker', () => {
  it('records the last own position when the player starts spectating a teammate', () => {
    const memory: DeathTrackerMemory = { alive: false, lastSeen: 0 };
    observeTick(memory, tick({ phase: 'freezetime' }), 0);
    observeTick(memory, tick({ phase: 'live' }), 1_000);
    observeTick(memory, tick({ phase: 'live', position: '10.0, 20.0, 30.0', health: 40 }), 19_000);
    const { death } = observeTick(memory, tick({ phase: 'live', steamid: MATE, position: '999.0, 999.0, 0.0' }), 19_500);
    expect(death).toEqual({ roundNumber: 6, secondsIntoRound: 18.5, side: 'CT', x: 10, y: 20, z: 30, weapon: 'ak47' });
    // Further spectating ticks do not record the same death again.
    expect(observeTick(memory, tick({ phase: 'live', steamid: MATE }), 20_000).death).toBeUndefined();
  });

  it('records a death reported as zero health', () => {
    const memory: DeathTrackerMemory = { alive: false, lastSeen: 0 };
    observeTick(memory, tick({ phase: 'live' }), 0);
    expect(observeTick(memory, tick({ phase: 'live', health: 0 }), 5_000).death?.secondsIntoRound).toBe(5);
  });

  it('reports the round winner and ignores warmup', () => {
    const memory: DeathTrackerMemory = { alive: false, lastSeen: 0 };
    observeTick(memory, tick({ phase: 'live' }), 0);
    expect(observeTick(memory, tick({ phase: 'over', score: [4, 2], win: 'CT' }), 60_000).roundEnded).toEqual({ roundNumber: 6, winnerSide: 'CT' });

    const warmup: DeathTrackerMemory = { alive: false, lastSeen: 0 };
    observeTick(warmup, tick({ phase: 'live', mapPhase: 'warmup' }), 0);
    expect(observeTick(warmup, tick({ phase: 'live', mapPhase: 'warmup', health: 0 }), 1_000).death).toBeUndefined();
  });

  it('does not count a death after the round is over', () => {
    const memory: DeathTrackerMemory = { alive: false, lastSeen: 0 };
    observeTick(memory, tick({ phase: 'live' }), 0);
    observeTick(memory, tick({ phase: 'over', win: 'T' }), 1_000);
    expect(observeTick(memory, tick({ phase: 'over', health: 0 }), 2_000).death).toBeUndefined();
  });
});
