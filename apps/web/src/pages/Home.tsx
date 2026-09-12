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
  const [refreshingMatches, setRefreshingMatches] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const pollStartedAt = useRef(0);

  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setNotice(null);
    try {
      await api.disconnectFaceit();
      setFaceit({ connected: false });
      setMatches([]);
      setNotice('FACEIT akkaunt uzildi.');
    } catch (err) {
      const error = err as { message?: string; status?: number; code?: string };
      setNotice(error.message || `FACEITdan chiqishda xato (${error.status ?? 500})`);
    } finally {
      setDisconnecting(false);
    }
  };

  const refreshFaceit = async (): Promise<boolean> => {
    try {
      const status = await api.faceitStatus();
      setFaceit(status);
      return status.connected;
    } catch {
      return false;
    }
  };

  const refreshMatches = async () => {
    if (refreshingMatches) return;
    setRefreshingMatches(true);
    try {
      const next = await api.listMatches();
      setMatches(next);
      setNotice(null);
    } catch (err) {
      const error = err as { message?: string };
      setNotice(error.message ?? 'Matchlarni yuklashda xato');
    } finally {
      setRefreshingMatches(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [fs, ms] = await Promise.all([api.faceitStatus(), api.listMatches().catch(() => [])]);
        setFaceit(fs);
        setMatches(ms);
      } catch (err) {
        const error = err as { message?: string };
        setNotice(error.message ?? 'Maʼlumotlarni yuklashda xato');
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
      if (document.visibilityState === 'visible') {
        void refreshFaceit();
        void refreshMatches();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

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
      if (connected) void refreshMatches();
      return;
    }
    pollTimer.current = window.setTimeout(() => void pollFaceitStatus(), FACEIT_POLL_MS);
  };

  const connect = async () => {
    setNotice(null);
    setConnecting(true);
    try {
      const { url } = await api.connectFaceit();
      const tgApp = getTelegramWebApp();
      if (tgApp?.openLink) tgApp.openLink(url);
      else window.open(url, '_blank');
      pollStartedAt.current = Date.now();
      void pollFaceitStatus();
    } catch (err) {
      const error = err as { message?: string };
      setNotice(error.message ?? 'FACEIT ulashda xato');
      setConnecting(false);
    }
  };

  if (busy) return <main className="panel"><div className="spinner" /></main>;

  return (
    <main className="panel home">
      <header className="topbar">
        <h1>Coach</h1>
        {faceit?.connected && (
          <button className="logout-btn" onClick={() => void disconnect()} disabled={disconnecting} type="button">
            {disconnecting ? 'Uzilmoqda…' : 'FACEITdan chiqish'}
          </button>
        )}
      </header>
      {notice && <p className="error-banner">{notice}</p>}

      <section className="card">
        {faceit?.connected ? (
          <>
            <h2>FACEIT connected</h2>
            {faceit.avatar && <img src={faceit.avatar} alt="FACEIT avatar" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />}
            <p className="muted">Nickname: <strong>{faceit.nickname}</strong></p>
            {faceit.country && <p className="muted">Country: <strong>{faceit.country.toUpperCase()}</strong></p>}
            {faceit.skillLevel != null && <p className="muted">Skill level: <strong>{faceit.skillLevel}</strong></p>}
            {faceit.elo != null && <p className="muted">ELO: <strong>{faceit.elo}</strong></p>}
            <p className="muted">FACEIT ID: <strong>{faceit.faceitUserId}</strong></p>
            <p className="muted">Live coaching is available during your matches.</p>
            <button className="secondary" onClick={() => void disconnect()} disabled={disconnecting} type="button">
              {disconnecting ? 'FACEIT uzilmoqda…' : 'FACEIT akkauntni uzish'}
            </button>
          </>
        ) : (
          <>
            <h2>Connect your FACEIT</h2>
            <p className="muted">The coach reads real match state and suggests tactics. No data is ever faked.</p>
            <button className="primary" onClick={connect} disabled={connecting}>{connecting ? 'Waiting for FACEIT…' : 'Connect FACEIT'}</button>
          </>
        )}
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>Recent matches</h2>
          <button className="secondary" onClick={() => void refreshMatches()} disabled={refreshingMatches} type="button">
            {refreshingMatches ? 'Yangilanmoqda…' : 'Yangilash'}
          </button>
        </div>
        {matches.length === 0 ? (
          <p className="waiting">No matches yet. Finished online matches will appear here.</p>
        ) : (
          <ul className="matchlist">
            {matches.map((m) => (
              <li key={m.id}>
                <button className="row-btn" onClick={() => navigate('match', m.faceitMatchId)}>
                  <span>{m.map ?? 'unknown'}</span><span>{m.score.a}:{m.score.b}</span><span className="pill">{m.status}</span>
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
