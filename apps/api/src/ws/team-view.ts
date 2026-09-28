/**
 * Per-team view of a live match state. Player positions feed the live radar,
 * so a client must only ever receive its own team's positions — sending the
 * opposing team's locations would turn the coach into a wallhack.
 */
import type { MatchState } from '@cs2coach/shared';

export type TeamSide = 'A' | 'B' | null | undefined;

export function stateForTeam(state: MatchState, team: TeamSide): MatchState {
  const allowed = new Set(team ? state.players.filter((p) => p.team === team).map((p) => p.faceitPlayerId) : []);
  const positions = Object.fromEntries(Object.entries(state.positions).filter(([id]) => allowed.has(id)));
  const recentEvents = state.recentEvents.map((e) =>
    e.type === 'player_state_updated' && e.position && !allowed.has(e.player.faceitPlayerId) ? { ...e, position: undefined } : e);
  return { ...state, positions, recentEvents };
}
