import type { MatchStateLite } from '../lib/types';

export function LiveScore({ state }: { state: MatchStateLite }) {
  const alive = state.alivePlayers;
  return (
    <div className="live-score">
      <div className="scores">
        <span className="score-a">{state.score.a}</span>
        <span>—</span>
        <span className="score-b">{state.score.b}</span>
      </div>
      <div className="alive-row muted">
        {alive.length} alive · {state.phase}
        {state.map ? ` · ${state.map}` : ''}
      </div>
    </div>
  );
}