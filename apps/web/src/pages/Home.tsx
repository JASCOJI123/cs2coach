import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { getTelegramWebApp } from '../lib/telegram';
import { navigate } from '../App';
import type { FaceitStatus, MatchLite } from '../lib/types';

const FACEIT_POLL_MS = 1500;
const FACEIT_POLL_TIMEOUT_MS = 5 * 60_000;

export default function Home() {
  const [faceit, setFaceit] = useState<FaceitStatus | null>(null);
  const [matches, setMatches] = useState<MatchLite[]>([]);
  const [busy, setBusy] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const pollStartedAt = useRef(0);

  const refreshFaceit = async (): Promise<boolean> => {
    try {
      const status = await api.faceitStatus();
      setFaceit(status);
      return status.connected;
    } catch {
      return false;
    }
  };

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

    return () => {
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshFaceit();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const stopFaceitPolling = () => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    setConnecting(false);
  };

  const pollFaceitStatus = async () => {
    const connected = await refreshFaceit();
    if (connected || Date.now() - pollStartedAt.current >= FACEIT_POLL_TIMEOUT_MS) {
      stopFaceitPolling();
      return;
    }
    pollTimer.current = window.setTimeout(() => void pollFaceitStatus(), FACEIT_POLL_MS);
  };

  const connect = async () => {
    setNotice(null);
    setConnecting(true);
    try {
      const { url } = await api.connectFaceit();
      // Keep the Mini App open while FACEIT runs in the external browser.
      // The original Mini App session is not shared with that browser, so the
      // Mini App polls the server until the FACEIT account is saved.
      const tgApp = getTelegramWebApp();
      if (tgApp?.openLink) {
        tgApp.openLink(url);
      } else {
        window.open(url, '_blank');
      }
      pollStartedAt.current = Date.now();
      void pollFaceitStatus();
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