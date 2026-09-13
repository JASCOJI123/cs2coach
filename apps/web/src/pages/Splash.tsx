import { useEffect, useState } from 'react';
import './splash.css';
import { api, clearAuthToken, hasAuthToken, setAuthToken } from '../lib/api';
import { getInitData } from '../lib/telegram';
import { navigate } from '../App';

const LOGGED_OUT_KEY = 'cs2coach.logged_out.v1';
export function markLoggedOut(): void { try { sessionStorage.setItem(LOGGED_OUT_KEY, '1'); } catch {} }

export default function Splash() {
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [loggedOut, setLoggedOut] = useState(false);
  const login = async () => { setError(null); setBusy(true); try { try { sessionStorage.removeItem(LOGGED_OUT_KEY); } catch {} const initData = getInitData(); if (!initData) { setError('Open this app from the Telegram bot via "OPEN AI COACH".'); return; } const auth = await api.login(initData); setAuthToken(auth.token); navigate('home'); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } };
  useEffect(() => { let wasLoggedOut = false; try { wasLoggedOut = sessionStorage.getItem(LOGGED_OUT_KEY) === '1'; } catch {} if (wasLoggedOut) { clearAuthToken(); setLoggedOut(true); return; } void (async () => { try { if (hasAuthToken()) { try { await api.faceitStatus(); navigate('home'); return; } catch (err) { if ((err as { status?: number }).status !== 401) throw err; clearAuthToken(); } } await login(); } catch (err) { setError((err as Error).message); } })(); }, []);
  return <main className="splash branded-splash"><div className="splash-glow" /><div className="splash-brand"><div className="splash-mark">C</div><div><strong>CS2<span>COACH</span></strong><small>AI POWERED</small></div></div><div className="splash-center"><span className="eyebrow">TACTICAL INTELLIGENCE</span><h1>Play smarter.<br /><em>Rank higher.</em></h1><p>AI coaching built around your real CS2 matches.</p><div className="splash-radar"><i /><i /><i /><span>AI</span></div></div>{busy && <div className="splash-status"><span className="pulse" /> CONNECTING TO COACH SYSTEM</div>}{loggedOut && !busy && <button className="primary splash-login" onClick={login} type="button">QAYTA KIRISH →</button>}{error && <p className="error-banner">{error}</p>}<small className="splash-foot">REAL INSIGHTS · REAL IMPROVEMENT</small></main>;
}
