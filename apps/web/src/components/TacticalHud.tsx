import type { MatchStateLite, TacticalDecisionLite } from '../lib/types';
import { SignalRow } from './SignalRow';

interface Props {
  state: MatchStateLite;
  decision: TacticalDecisionLite | null;
  connected: boolean;
}

const ACTION_COLOR: Record<string, string> = {
  FAST_A: 'var(--accent-ct)',
  FAST_B: 'var(--accent-ct)',
  SPLIT_A: 'var(--accent-ct)',
  SPLIT_B: 'var(--accent-ct)',
  ANTI_ECO: 'var(--accent-green)',
  FORCE: 'var(--accent-gold)',
  ECONOMIZE: 'var(--accent-gold)',
  SAVE: 'var(--muted)',
  RETREAT: 'var(--accent-red)',
  DEFAULT: 'var(--muted)',
};

function confidenceLabel(c: string): string {
  return c === 'HIGH' ? 'High' : c === 'MEDIUM' ? 'Medium' : 'Low';
}

export function TacticalHud({ state, decision, connected }: Props) {
  const noLiveData = !state.gameDataAvailable;
  const color = decision ? ACTION_COLOR[decision.recommendation.action] ?? 'var(--muted)' : 'var(--muted)';

  return (
    <section className={`tactical-hud ${state.demoMode ? 'demo' : ''}`}>
      {state.demoMode && <div className="demo-stripe">DEMO MODE — simulated stream for development</div>}

      {noLiveData ? (
        <div className="waiting-card">
          <div className="logo-mark small">◆</div>
          <h2>Waiting for live game data</h2>
          <p className="muted">The coach needs a real, running match to give advice. No simulated data is shown here.</p>
        </div>
      ) : decision ? (
        <>
          <div className="call-block" style={{ borderColor: color }}>
            <div className="call-meta">
              <span className="pill" style={{ background: color }}>{decision.recommendation.action}</span>
              <span className="muted">{confidenceLabel(decision.recommendation.confidence)} confidence</span>
              {!decision.deterministic ? <span className="muted">· ai</span> : <span className="muted">· rules</span>}
            </div>
            <p className="call-detail">{decision.recommendation.detail}</p>
          </div>

          {decision.instructions.length > 0 && (
            <ul className="inst-list">
              {decision.instructions.map((i) => (
                <li key={i.faceitPlayerId}>
                  <strong>{i.nickname}</strong>
                  <span className="role">{i.role}</span>
                  <p>{i.instruction}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="signals">
            {decision.signals.length === 0 && <SignalRow label="signal" detail="collecting…" none />}
            {decision.signals.map((s) => <SignalRow key={s.label} label={s.label} detail={s.detail} />)}
          </div>
        </>
      ) : (
        <div className="waiting-card">
          <div className="logo-mark small">◆</div>
          <h2>Analysing the round…</h2>
          <div className="spinner small" />
        </div>
      )}

      <footer className="hud-foot muted">
        {connected ? '● live via WebSocket' : '○ fallback polling'}
        {' · '}
        round {state.round} · {state.side ?? '—'} · {state.score.a}:{state.score.b}
      </footer>
    </section>
  );
}