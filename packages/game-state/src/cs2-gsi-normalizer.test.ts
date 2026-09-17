import { describe, expect, it } from 'vitest';
import { Cs2GsiEdgeDetector, buildTelemetry, normalizePosition } from './cs2-gsi-normalizer';

describe('CS2 GSI normalizer', () => {
  it('parses coordinates safely', () => {
    expect(normalizePosition('1, 2, 3')).toEqual({ x: 1, y: 2, z: 3 });
    expect(normalizePosition('bad')).toBeUndefined();
  });

  it('turns allplayers into reusable telemetry', () => {
    const telemetry = buildTelemetry({
      allplayers: {
        a: { team: 'CT', position: '1,2,3', state: { health: 100, money: 4200 }, weapons: { '1': { name: 'weapon_ak47' } } },
        b: { team: 'T', position: '4,5,6', state: { health: 0, money: 1200 }, weapons: { '1': { name: 'weapon_glock' } } },
      },
    });
    expect(telemetry.playerIds).toEqual(['a', 'b']);
    expect(telemetry.alivePlayers).toBe(1);
    expect(telemetry.positions.a).toEqual({ x: 1, y: 2, z: 3 });
    expect(telemetry.weapons.a).toContain('weapon_ak47');
    expect(telemetry.economy.b).toBe(1200);
  });

  it('emits each edge once', () => {
    const detector = new Cs2GsiEdgeDetector();
    const first = detector.detect({ round: { phase: 'freezetime' } }, 4);
    expect(first).toEqual([{ type: 'round_start', round: 4 }]);
    expect(detector.detect({ round: { phase: 'freezetime' } }, 4)).toEqual([]);
    expect(detector.detect({ round: { phase: 'over', win_team: 'CT' } }, 4)).toEqual([{ type: 'round_over', round: 4, winner: 'CT' }]);
    expect(detector.detect({ round: { phase: 'over', win_team: 'CT' } }, 4)).toEqual([]);
    expect(detector.detect({ bomb: { state: 'planted' } }, 5)).toEqual([{ type: 'round_start', round: 5 }, { type: 'bomb_planted' }]);
    expect(detector.detect({ bomb: { state: 'planted' } }, 5)).toEqual([]);
  });
});
