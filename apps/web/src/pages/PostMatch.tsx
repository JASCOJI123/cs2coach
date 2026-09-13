import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { navigate } from '../App';
import type { PostMatchAnalysis } from '../lib/types';

interface Props { faceitMatchId: string; }

export default function PostMatch({ faceitMatchId }: Props) {
  const [analysis, setAnalysis] = useState<PostMatchAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setAnalysis(await api.getMatchAnalysis(faceitMatchId)); setError(null); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [faceitMatchId]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true); setError(null);
    try { setAnalysis(await api.generateMatchAnalysis(faceitMatchId)); }
    catch (err) { setError((err as Error).message); }
    finally { setGenerating(false); }
  };

  if (loading) return <main className="panel"><header className="topbar"><button className="back" onClick={() => navigate('matches')}>‹</button><h1>Match Analysis</h1></header><div className="waiting-card"><div className="spinner" /><h2>Analiz yuklanmoqda…</h2></div></main>;

  return <main className="panel">
    <header className="topbar"><button className="back" onClick={() => navigate('matches')}>‹</button><h1>Post-Match AI</h1></header>
    {error && <p className="error-banner">{error}</p>}
    {!analysis ? <section className="card empty-match"><h2>AI tahlil hali yaratilmagan</h2><p className="muted">Match roundlari va mavjud statistikalar asosida shaxsiy tahlil yaratamiz.</p><button className="primary" onClick={() => void generate()} disabled={generating}>{generating ? 'AI analiz qilmoqda…' : '🤖 Analizni yaratish'}</button></section> : <>
      <section className="card"><div className="section-heading"><h2>Overall</h2><span className="pill">AI</span></div><div className="score-grid">
        {Object.entries(analysis.overallScore).map(([key, value]) => <div className="score-item" key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{value}</strong></div>)}
      </div></section>
      <section className="card"><div className="section-heading"><h2>Round review</h2></div><div className="analysis-block"><b>Best round</b><p>{analysis.bestRound ? `#${analysis.bestRound.roundNumber} — ${analysis.bestRound.reason}` : 'Yetarli maʼlumot yo‘q'}</p></div><div className="analysis-block"><b>Worst round</b><p>{analysis.worstRound ? `#${analysis.worstRound.roundNumber} — ${analysis.worstRound.reason}` : 'Yetarli maʼlumot yo‘q'}</p></div></section>
      <section className="card"><h2>Top mistakes</h2><ul>{analysis.topMistakes.map((x, i) => <li key={i}>{x}</li>)}</ul><h2>Top decisions</h2><ul>{analysis.topDecisions.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
      <section className="card"><h2>Opponent patterns</h2><ul>{analysis.opponentPatterns.length ? analysis.opponentPatterns.map((x, i) => <li key={i}>{x}</li>) : <li>Pattern hali yetarli emas.</li>}</ul></section>
      <section className="card"><h2>7-day training plan</h2><div className="analysis-list">{analysis.trainingPlan.map((day) => <div className="analysis-row" key={day.day}><span>Day {day.day}</span><b>{day.focus}</b></div>)}</div></section>
      <button className="secondary" onClick={() => void generate()} disabled={generating}>{generating ? 'Qayta analiz qilinmoqda…' : '↻ Qayta analiz qilish'}</button>
    </>}
  </main>;
}
