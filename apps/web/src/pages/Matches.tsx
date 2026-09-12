import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { navigate } from '../App';
import type { MatchLite } from '../lib/types';

const REFRESH_MS = 5000;
const activeStatuses = new Set(['scheduled', 'configuring', 'ready', 'ongoing', 'started', 'live']);

export default function Matches() {
  const [matches, setMatches] = useState<MatchLite[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try { setMatches(await api.listMatches()); setError(null); }
    catch (err) { setError((err as Error).message); }
    finally { if (!silent) setRefreshing(false); setBusy(false); }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(true); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const live = matches.find((m) => activeStatuses.has(m.status.toLowerCase()));

  return (
    <main className="panel">
      <header className="topbar">
        <button className="back" onClick={() => navigate('home')}>‹</button>
        <h1>Matches</h1>
        <button className="secondary" onClick={() => void refresh()} disabled={refreshing} type="button">{refreshing ? '…' : '↻'}</button>
      </header>

      {live && (
        <section className="card live-match-card">
          <div className="section-heading"><h2>🟢 LIVE MATCH</h2><span className="pill">{live.status}</span></div>
          <p className="muted">{live.map ?? 'Map aniqlanmoqda'} · {live.score.a}:{live.score.b}</p>
          <button className="primary" onClick={() => navigate('match', live.faceitMatchId)} type="button">Live coachni ochish</button>
        </section>
      )}

      {error && <p className="error-banner">{error}</p>}
      {busy && <div className="spinner" />}
      {!busy && matches.length === 0 && <p className="waiting" style={{ padding: 24 }}>No matches recorded yet. FACEIT webhook and CS2 GSI are waiting for the next match.</p>}

      <ul className="matchlist">
        {matches.map((m) => (
          <li key={m.id}>
            <button className="row-btn" onClick={() => navigate('match', m.faceitMatchId)}>
              <span>{m.map ?? 'unknown'}</span>
              <span>{m.score.a}:{m.score.b}</span>
              <span className={`pill ${activeStatuses.has(m.status.toLowerCase()) ? 'live-pill' : ''}`}>{m.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
