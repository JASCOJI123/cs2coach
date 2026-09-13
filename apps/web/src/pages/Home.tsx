import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { navigate } from '../App';
import type { FaceitStatus, MatchLite } from '../lib/types';

const FACEIT_POLL_MS = 1500;
const FACEIT_POLL_TIMEOUT_MS = 5 * 60_000;

function isLive(status?: string): boolean {
  return status === 'ongoing' || status === 'ready' || status === 'configuring';
}

function statusLabel(status: string): string {
  if (status === 'ongoing') return 'LIVE';
  if (status === 'ready') return 'READY';
  if (status === 'configuring') return 'STARTING';
  if (status === 'finished') return 'FINISHED';
  return status.toUpperCase();
}

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
    setDisconnecting(true); setNotice(null);
    try { await api.disconnectFaceit(); setFaceit({ connected: false }); setMatches([]); setNotice('FACEIT akkaunt uzildi.'); }
    catch (err) { const error = err as { message?: string; status?: number }; setNotice(error.message || `FACEITdan chiqishda xato (${error.status ?? 500})`); }
    finally { setDisconnecting(false); }
  };

  const refreshFaceit = async (): Promise<boolean> => {
    try { const status = await api.faceitStatus(); setFaceit(status); return status.connected; }
    catch { return false; }
  };

  const refreshMatches = async () => {
    if (refreshingMatches) return;
    setRefreshingMatches(true);
    try { setMatches(await api.listMatches()); setNotice(null); }
    catch (err) { setNotice((err as { message?: string }).message ?? 'Matchlarni yuklashda xato'); }
    finally { setRefreshingMatches(false); }
  };

  useEffect(() => {
    void (async () => {
      try { const [fs, ms] = await Promise.all([api.faceitStatus(), api.listMatches().catch(() => [])]); setFaceit(fs); setMatches(ms); }
      catch (err) { setNotice((err as { message?: string }).message ?? 'Maʼlumotlarni yuklashda xato'); }
      finally { setBusy(false); }
    })();
    return () => { if (pollTimer.current !== null) window.clearTimeout(pollTimer.current); };
  }, []);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') { void refreshFaceit(); void refreshMatches(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  const stopFaceitPolling = () => { if (pollTimer.current !== null) { window.clearTimeout(pollTimer.current); pollTimer.current = null; } setConnecting(false); };
  const pollFaceitStatus = async () => {
    const connected = await refreshFaceit();
    if (connected || Date.now() - pollStartedAt.current >= FACEIT_POLL_TIMEOUT_MS) { stopFaceitPolling(); if (connected) void refreshMatches(); return; }
    pollTimer.current = window.setTimeout(() => void pollFaceitStatus(), FACEIT_POLL_MS);
  };

  const connect = async () => {
    setNotice(null); setConnecting(true);
    try {
      const { url } = await api.connectFaceit();
      window.location.assign(url);
      pollStartedAt.current = Date.now();
      void pollFaceitStatus();
    } catch (err) { setNotice((err as { message?: string }).message ?? 'FACEIT ulashda xato'); setConnecting(false); }
  };

  if (busy) return <main className="panel home"><div className="brand-loader"><span className="brand-loader-mark">C</span><span>CS2<span>COACH</span></span></div><div className="spinner" /></main>;

  const liveMatch = matches.find((m) => isLive(m.status));
  const recent = matches.filter((m) => m.id !== liveMatch?.id).slice(0, 4);

  return (
    <main className="panel home command-center">
      <header className="command-topbar">
        <div className="brand-lockup">
          <div className="brand-mark">C</div>
          <div><strong>CS2<span>COACH</span></strong><small>AI POWERED</small></div>
        </div>
        <div className={`connection-dot ${faceit?.connected ? 'online' : ''}`}><i />{faceit?.connected ? 'ONLINE' : 'OFFLINE'}</div>
      </header>

      {notice && <p className="error-banner">{notice}</p>}

      {!faceit?.connected ? (
        <section className="hero-card disconnected-hero">
          <div className="hero-grid" />
          <div className="hero-copy">
            <span className="eyebrow">AI TACTICAL SYSTEM</span>
            <h1>Play smarter.<br /><em>Win more.</em></h1>
            <p>Real-time tactical coaching for your FACEIT matches. Your game state becomes actionable decisions.</p>
            <button className="primary hero-cta" onClick={connect} disabled={connecting} type="button"><span className="cta-icon">◈</span>{connecting ? 'FACEIT ochilmoqda…' : 'CONNECT WITH FACEIT'}<b>→</b></button>
          </div>
          <div className="hero-orbit"><span>AI</span><i /><i /><i /></div>
        </section>
      ) : (
        <>
          <section className="player-card">
            <div className="player-avatar">{faceit.avatar ? <img src={faceit.avatar} alt="FACEIT avatar" /> : <span>{(faceit.nickname ?? 'P').slice(0, 1).toUpperCase()}</span>}</div>
            <div className="player-info"><span className="eyebrow">WELCOME BACK</span><h1>{faceit.nickname ?? 'Player'}</h1><p>FACEIT Level {faceit.skillLevel ?? '—'} {faceit.country ? `· ${faceit.country.toUpperCase()}` : ''}</p></div>
            <div className="level-ring"><strong>{faceit.skillLevel ?? '—'}</strong><small>LVL</small></div>
          </section>

          <section className="elo-card">
            <div><span className="eyebrow">YOUR RATING</span><strong className="elo-value">{faceit.elo ?? '—'}</strong><span className="elo-label">FACEIT ELO</span></div>
            <div className="mini-chart"><i /><i /><i /><i /><i /><i /><i /></div>
          </section>

          {liveMatch ? (
            <button className="live-command" onClick={() => navigate('match', liveMatch.faceitMatchId)} type="button">
              <div className="live-command-head"><span><i className="pulse" /> LIVE MATCH</span><b>ENTER →</b></div>
              <div className="live-match-main"><div><strong>{liveMatch.map ?? 'MATCH'}</strong><small>FACEIT · {statusLabel(liveMatch.status)}</small></div><div className="live-score-home"><strong>{liveMatch.score.a}</strong><span>:</span><strong>{liveMatch.score.b}</strong></div></div>
              <div className="live-command-foot"><span>AI COACH READY</span><span>OPEN TACTICAL HUD</span></div>
            </button>
          ) : (
            <section className="idle-card"><div className="idle-radar"><i /><i /><i /><span>◎</span></div><div><span className="eyebrow">NO LIVE MATCH</span><h2>System is ready.</h2><p>Start a FACEIT match and your live tactical HUD will appear here automatically.</p></div></section>
          )}

          <section className="quick-grid">
            <button onClick={() => navigate('matches')} type="button"><span>◫</span><strong>MATCHES</strong><small>{matches.length} recorded</small></button>
            <button onClick={() => liveMatch && navigate('match', liveMatch.faceitMatchId)} disabled={!liveMatch} type="button"><span>⌁</span><strong>AI COACH</strong><small>{liveMatch ? 'Live guidance' : 'Waiting for match'}</small></button>
            <button onClick={() => navigate('matches')} type="button"><span>◈</span><strong>ANALYSIS</strong><small>Review performance</small></button>
          </section>

          <section className="section-block">
            <div className="section-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Match history</h2></div><button className="text-action" onClick={() => void refreshMatches()} disabled={refreshingMatches} type="button">{refreshingMatches ? 'SYNC…' : 'VIEW ALL →'}</button></div>
            {recent.length === 0 ? <div className="empty-state">No match history yet.</div> : <ul className="matchlist branded-list">{recent.map((m) => <li key={m.id}><button className="row-btn" onClick={() => navigate('match', m.faceitMatchId)} type="button"><span className="map-badge">{(m.map ?? '?').slice(0, 1).toUpperCase()}</span><span className="match-map"><strong>{m.map ?? 'Unknown map'}</strong><small>{statusLabel(m.status)}</small></span><span className="home-score">{m.score.a}:{m.score.b}</span><span className={`pill ${m.status === 'finished' ? 'finished-pill' : ''}`}>{statusLabel(m.status)}</span><b className="row-arrow">→</b></button></li>)}</ul>}
          </section>

          <button className="account-link" onClick={() => void disconnect()} disabled={disconnecting} type="button"><span>⚙</span>{disconnecting ? 'DISCONNECTING…' : 'FACEIT ACCOUNT'}<b>↗</b></button>
        </>
      )}

      <nav className="bottom-nav" aria-label="Main navigation">
        <button className="active" onClick={() => navigate('home')} type="button"><span>⌂</span><small>Home</small></button>
        <button onClick={() => navigate('matches')} type="button"><span>◫</span><small>Matches</small></button>
        <button onClick={() => liveMatch && navigate('match', liveMatch.faceitMatchId)} disabled={!liveMatch} type="button"><span>⌁</span><small>Live AI</small></button>
        <button onClick={() => navigate('matches')} type="button"><span>◎</span><small>Profile</small></button>
      </nav>
    </main>
  );
}
