import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { navigate } from '../App';
import type { FaceitStatus, MatchLite } from '../lib/types';

export default function Home() {
  const [faceit, setFaceit] = useState<FaceitStatus | null>(null);
  const [matches, setMatches] = useState<MatchLite[]>([]);
  const [busy, setBusy] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [fs, ms] = await Promise.all([api.faceitStatus(), api.listMatches().catch(() => [])]);
        setFaceit(fs);
        setMatches(ms);
      } catch (err) {
        setNotice((err as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const { url } = await api.connectFaceit();
      window.location.href = url;
    } catch (err) {
      setNotice((err as Error).message);
      setConnecting(false);
    }
  };

  if (busy) return <main className="panel"><div className="spinner" /></main>;

  return (
    <main className="panel home">
      <header className="topbar">
        <h1>Coach</h1>
      </header>

      {notice && <p className="error-banner">{notice}</p>}

      <section className="card">
        {faceit?.connected ? (
          <>
            <h2>FACEIT connected</h2>
            <p className="muted">Nickname: <strong>{faceit.nickname}</strong></p>
            <p className="muted">Live coaching is available during your matches.</p>
          </>
        ) : (
          <>
            <h2>Connect your FACEIT</h2>
            <p className="muted">The coach reads real match state and suggests tactics. No data is ever faked.</p>
            <button className="primary" onClick={connect} disabled={connecting}>
              {connecting ? 'Waiting for FACEIT…' : 'Connect FACEIT'}
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>Recent matches</h2>
        {matches.length === 0 ? (
          <p className="waiting">No matches yet. Finished online matches will appear here.</p>
        ) : (
          <ul className="matchlist">
            {matches.map((m) => (
              <li key={m.id}>
                <button className="row-btn" onClick={() => navigate('match', m.faceitMatchId)}>
                  <span>{m.map ?? 'unknown'}</span>
                  <span>{m.score.a}:{m.score.b}</span>
                  <span className="pill">{m.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Open live coach</h2>
        <button className="secondary" onClick={() => navigate('matches')}>Match list</button>
      </section>
    </main>
  );
}