import { emptyMatchState, type MatchPlayer } from '@cs2coach/shared';
import { stateForTeam } from './team-view';
import { WebSocketManager } from './websocket-manager';

function player(id: string, team: 'A' | 'B'): MatchPlayer {
  return { faceitPlayerId: id, nickname: id, team, alive: true, hp: 100, kills: 0, deaths: 0, assists: 0, weapons: [] } as unknown as MatchPlayer;
}

function liveState() {
  const state = emptyMatchState('m1');
  state.players = [player('me', 'A'), player('mate', 'A'), player('enemy', 'B')];
  state.positions = { me: [{ x: 1, y: 2, z: 0, ts: 1 }], mate: [{ x: 3, y: 4, z: 0, ts: 1 }], enemy: [{ x: 9, y: 9, z: 0, ts: 1 }] };
  state.recentEvents = [{ type: 'player_state_updated', matchId: 'm1', ts: 1, player: { faceitPlayerId: 'enemy', nickname: 'enemy' }, team: 'B', alive: true, position: { x: 9, y: 9, z: 0 } }];
  return state;
}

describe('stateForTeam', () => {
  it('keeps only the own team positions', () => {
    const view = stateForTeam(liveState(), 'A');
    expect(Object.keys(view.positions).sort()).toEqual(['mate', 'me']);
    const ev = view.recentEvents[0];
    expect(ev?.type === 'player_state_updated' && ev.position).toBeFalsy();
  });

  it('drops every position when the team is unknown', () => {
    expect(stateForTeam(liveState(), null).positions).toEqual({});
  });
});

describe('WebSocketManager team filtering', () => {
  it('sends each client its own team view and team-only decisions', () => {
    const ws = new WebSocketManager();
    const a: any[] = []; const b: any[] = [];
    ws.register('a', 'm1', 'A', (p) => a.push(p));
    ws.register('b', 'm1', 'B', (p) => b.push(p));
    ws.broadcastState('m1', liveState());
    expect(Object.keys(a[0].state.positions).sort()).toEqual(['mate', 'me']);
    expect(Object.keys(b[0].state.positions)).toEqual(['enemy']);
    ws.broadcastDecision('m1', { x: 1 }, 'A');
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(1);
  });
});
