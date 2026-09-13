import { useCallback, useEffect, useRef, useState } from 'react';
import { api, authTokenOrThrow } from '../lib/api';
import { openLiveCoach } from '../lib/ws';
import { navigate } from '../App';
import { TacticalHud } from '../components/TacticalHud';
import { LiveScore } from '../components/LiveScore';
import type { MatchStateLite, TacticalDecisionLite } from '../lib/types';

interface Props { faceitMatchId: string; }
const finishedStatuses = new Set(['finished', 'aborted', 'cancelled']);

export default function MatchPage({ faceitMatchId }: Props) {
  const [state, setState] = useState<MatchStateLite | null>(null);
  const [decision, setDecision] = useState<TacticalDecisionLite | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchStatus, setMatchStatus] = useState('');
  const tokenRef = useRef('');

  const loadMatch = useCallback(async () => {
    try {
      const match = await api.getMatch(faceitMatchId);
      setMatchStatus(match.status);
      setState(match.live ?? null);
      setError(null);
    } catch (err) { setError((err as Error).message || 'Match maʼlumotini yuklab bo‘lmadi'); }
    finally { setLoading(false); }
  }, [faceitMatchId]);

  useEffect(() => {
    try { tokenRef.current = authTokenOrThrow(); }
    catch (err) { setError((err as Error).message); setLoading(false); return; }
    void loadMatch();
    const close = openLiveCoach(faceitMatchId, tokenRef.current, {
      onState: (s) => { setState(s); setMatchStatus(s.status); setLoading(false); setError(null); },
      onDecision: (d) => setDecision(d),
      onConnection: (c) => setConnected(c),
    });
    return () => close();
  }, [faceitMatchId, loadMatch]);

  useEffect(() => { const timer = window.setInterval(() => { if (!connected) void loadMatch(); }, 8000); return () => window.clearInterval(timer); }, [connected, loadMatch]);

  const askCoach = async () => {
    if (asking) return;
    setAsking(true); setError(null);
    try { setDecision(await api.requestCoach(faceitMatchId)); }
    catch (err) { setError((err as Error).message || 'Coach hozir javob bera olmaydi'); }
    finally { setAsking(false); }
  };

  if (loading) return <main className="panel match"><header className="topbar"><button className="back" onClick={() => navigate('matches')}>‹</button><h1>Live Coach</h1></header><div className="waiting-card"><div className="spinner" /><h2>Match yuklanmoqda…</h2><p className="muted">FACEIT maʼlumotlari olinmoqda.</p></div></main>;

  const finished = finishedStatuses.has(matchStatus.toLowerCase());
  return <main className="panel match">
    <header className="topbar"><button className="back" onClick={() => navigate('matches')}>‹</button><h1>{finished ? 'Match Review' : 'Live Coach'}</h1><span className={`connection-dot ${connected ? 'online' : ''}`}>{connected ? 'LIVE' : 'SYNC'}</span></header>
    {error && <p className="error-banner">{error}</p>}
    {state ? <><LiveScore state={state} /><TacticalHud state={state} decision={decision} connected={connected} />{!finished && <button className="primary" onClick={() => void askCoach()} disabled={asking} style={{ marginTop: 12 }}>{asking ? 'Coach analiz qilmoqda…' : '🤖 Ask AI Coach'}</button>}{finished && <button className="primary" onClick={() => navigate('post-match', faceitMatchId)} style={{ marginTop: 12 }}>📊 Post-Match AI Analysis</button>}</> : <section className="card empty-match"><div className="logo-mark small">◆</div><h2>Live data hali mavjud emas</h2><p className="muted">Bu match tarixdan topildi, lekin real-time game state mavjud emas.</p>{finished && <button className="primary" onClick={() => navigate('post-match', faceitMatchId)}>📊 Post-Match AI Analysis</button>}<button className="secondary" onClick={() => void loadMatch()}>↻ Qayta tekshirish</button></section>}
  </main>;
}
