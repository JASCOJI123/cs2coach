import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { navigate } from '../App';
import type { MatchLite } from '../lib/types';

export default function Matches() {
  const [matches, setMatches] = useState<MatchLite[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setMatches(await api.listMatches());
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  return (
    <main className="panel">
      <header className="topbar">
        <button className="back" onClick={() => navigate('home')}>‹</button>
        <h1>Matches</h1>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {busy && <div className="spinner" />}

      {!busy && matches.length === 0 && (
        <p className="waiting" style={{ padding: 24 }}>No matches recorded yet. Connect FACEIT and finish a match.</p>
      )}

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
    </main>
  );
}