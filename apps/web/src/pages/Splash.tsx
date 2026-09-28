import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import './splash.css';
import './landing.css';
import logo from './brand/logo.svg';
import { faceitLoginUrl, hasAuthToken } from '../lib/api';
import { navigate } from '../App';
import { LanguageSwitcher, useI18n } from '../lib/i18n';
import { getMapImage } from '../lib/mapImages';
import { wt } from '../lib/webText';

const MAPS = ['mirage', 'dust2', 'inferno', 'anubis', 'ancient', 'nuke', 'vertigo', 'overpass', 'train'];
const CALLS = ['call1', 'call2', 'call3'] as const;
const CALL_MS = 4200;
/** Illustrative HUD state for each sample call: round, score, economy, confidence. */
const CALL_STATE = [
  { round: 21, score: '11 : 9', money: '$4 750', confidence: 86 },
  { round: 22, score: '11 : 10', money: '$1 400', confidence: 72 },
  { round: 23, score: '12 : 10', money: '$5 200', confidence: 91 },
];
/** Enemy pings on the radar, in % of the map box. */
const PINGS = [
  { x: 26, y: 30, d: 0 }, { x: 62, y: 22, d: 1.1 }, { x: 74, y: 64, d: 2.3 }, { x: 40, y: 72, d: 3.1 },
];
const ROUNDS = 'WWLWLLWWWLWW';

/** Adds `.in` to `.reveal` elements as they scroll into view. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.landing-page .reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/** Public landing page. Signing in goes through FACEIT OAuth on the API. */
export default function Splash() {
  const { t, lang } = useI18n();
  const [redirecting, setRedirecting] = useState(false);
  const [call, setCall] = useState(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const signedIn = hasAuthToken();
  useReveal();

  useEffect(() => {
    const timer = window.setInterval(() => setCall((c) => (c + 1) % CALLS.length), CALL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const signIn = () => {
    if (signedIn) { navigate('home'); return; }
    setRedirecting(true);
    window.location.assign(faceitLoginUrl());
  };

  // Cursor-following spotlight; plain CSS variables so React does not re-render.
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = pageRef.current;
    if (!el) return;
    el.style.setProperty('--mx', `${e.clientX}px`);
    el.style.setProperty('--my', `${e.clientY + window.scrollY}px`);
  };

  const ctaLabel = redirecting ? wt(lang, 'signingIn') : signedIn ? wt(lang, 'openDashboard') : wt(lang, 'signIn');
  const cta = (extra = '') => (
    <button className={`l-cta ${extra}`} onClick={signIn} disabled={redirecting}>
      <span className="l-cta-glyph" aria-hidden>◈</span>
      <span>{ctaLabel}</span>
      <span className="l-cta-arrow" aria-hidden>→</span>
    </button>
  );
  const state = CALL_STATE[call];
  const stats: Array<[string, string]> = [['9', wt(lang, 'stat1')], ['3', wt(lang, 'stat2')], ['7', wt(lang, 'stat3')], ['1', wt(lang, 'stat4')]];
  const steps = [wt(lang, 'step1'), wt(lang, 'step2'), wt(lang, 'step3')];

  return (
    <div className="landing-page" ref={pageRef} onMouseMove={onMove}>
      <div className="l-bg" aria-hidden><div className="l-grid" /><div className="l-orb l-orb-a" /><div className="l-orb l-orb-b" /><div className="l-spot" /></div>

      <header className="l-top l-wrap">
        <img className="l-logo" src={logo} alt="CS2USTOZ — Powered by JASCOAV" />
        <div className="l-top-actions">
          <LanguageSwitcher />
          <button className="l-signin" onClick={signIn}>{signedIn ? t('home') : wt(lang, 'signInShort')}</button>
        </div>
      </header>

      <section className="l-hero l-wrap">
        <div className="l-copy">
          <span className="l-chip"><i />{wt(lang, 'liveChip')}</span>
          <h1>
            <span className="l-line">{t('playSmarter')}</span>
            <span className="l-line l-outline">{t('rankHigher')}</span>
          </h1>
          <p className="l-lead">{wt(lang, 'landingLead')}</p>
          <div className="l-cta-row">{cta()}</div>
          <small className="l-note"><span aria-hidden>🔒</span> {wt(lang, 'secureNote')}</small>
        </div>

        <div className="l-hud" aria-hidden>
          <div className="l-hud-frame">
            <div className="l-hud-head">
              <span className="l-hud-title"><b>◆</b> {wt(lang, 'hudTitle')}</span>
              <span className="l-hud-live"><i />{wt(lang, 'hudLive')}</span>
            </div>
            <div className="l-radar">
              <img src={getMapImage('mirage')} alt="" />
              <div className="l-sweep" />
              <div className="l-rings"><i /><i /><i /></div>
              {PINGS.map((p, i) => <span key={i} className="l-ping" style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.d}s` }} />)}
              <span className="l-me" style={{ left: '48%', top: '52%' }} />
            </div>
            <div className="l-hud-meta">
              <div><small>{wt(lang, 'hudRound')}</small><strong key={`r${call}`} className="l-flip">{state.round}</strong></div>
              <div><small>CT : T</small><strong key={`s${call}`} className="l-flip">{state.score}</strong></div>
              <div><small>{wt(lang, 'hudEconomy')}</small><strong key={`m${call}`} className="l-flip">{state.money}</strong></div>
            </div>
            <div className="l-call" key={call}>
              <span className="l-call-tag">AI CALL · de_mirage</span>
              <p>{wt(lang, CALLS[call])}</p>
              <div className="l-conf"><span style={{ '--w': `${state.confidence}%` } as CSSProperties} /><b>{state.confidence}% {wt(lang, 'hudConfidence')}</b></div>
            </div>
            <div className="l-dots">{CALLS.map((c, i) => <i key={c} className={i === call ? 'on' : ''} />)}</div>
          </div>
          <span className="l-corner tl" /><span className="l-corner tr" /><span className="l-corner bl" /><span className="l-corner br" />
        </div>
      </section>

      <section className="l-maps reveal" aria-label={wt(lang, 'mapsLabel')}>
        <span className="l-maps-label l-wrap">{wt(lang, 'mapsLabel')}</span>
        <div className="l-marquee">
          <div className="l-track">
            {[...MAPS, ...MAPS].map((m, i) => (
              <figure key={`${m}${i}`} className="l-map" aria-hidden={i >= MAPS.length}>
                <img src={getMapImage(m)} alt="" loading="lazy" />
                <figcaption>de_{m}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="l-stats l-wrap reveal">
        {stats.map(([n, label]) => <div key={label} className="l-stat"><strong>{n}</strong><span>{label}</span></div>)}
      </section>

      <section className="l-features l-wrap">
        <div className="l-section-head reveal">
          <span className="l-eyebrow">{wt(lang, 'featuresEyebrow')}</span>
          <h2>{wt(lang, 'featuresTitle')}</h2>
        </div>
        <div className="l-bento">
          <article className="l-card l-card-wide reveal">
            <span className="l-card-icon">⌁</span>
            <h3>{wt(lang, 'f1Title')}</h3>
            <p>{wt(lang, 'f1Body')}</p>
            <div className="l-rounds" aria-hidden>
              {ROUNDS.split('').map((r, i) => <i key={i} className={r === 'W' ? 'w' : 'l'} style={{ '--i': i } as CSSProperties} />)}
            </div>
          </article>
          <article className="l-card reveal">
            <span className="l-card-icon">◈</span>
            <h3>{wt(lang, 'f2Title')}</h3>
            <p>{wt(lang, 'f2Body')}</p>
            <div className="l-skills" aria-hidden>
              {([['Aim', 82], ['Utility', 54], ['Trade', 71]] as const).map(([k, v]) => (
                <div key={k}><span>{k}</span><i><b style={{ '--w': `${v}%` } as CSSProperties} /></i><em>{v}</em></div>
              ))}
            </div>
          </article>
          <article className="l-card reveal">
            <span className="l-card-icon">✈</span>
            <h3>{wt(lang, 'f3Title')}</h3>
            <p>{wt(lang, 'f3Body')}</p>
            <div className="l-tg" aria-hidden>
              <div className="l-tg-bubble"><b>CS2USTOZ</b><span>🟢 {wt(lang, 'tgMockTitle')}</span><small>12:04</small></div>
              <div className="l-tg-btn">{wt(lang, 'tgMockBtn')} ↗</div>
            </div>
          </article>
        </div>
      </section>

      <section className="l-steps l-wrap reveal">
        <span className="l-eyebrow">{wt(lang, 'howItWorks')}</span>
        <ol>
          {steps.map((s, i) => <li key={s} style={{ '--i': i } as CSSProperties}><b>{String(i + 1).padStart(2, '0')}</b><span>{s}</span></li>)}
        </ol>
      </section>

      <section className="l-final l-wrap reveal">
        <div className="l-final-card">
          <div className="l-final-scope" aria-hidden><i /><i /></div>
          <h2>{wt(lang, 'ctaTitle')}</h2>
          <p>{wt(lang, 'ctaBody')}</p>
          {cta('l-cta-lg')}
        </div>
      </section>

      <footer className="l-foot l-wrap"><span>{wt(lang, 'footer')}</span><span className="l-foot-tag">GL HF</span></footer>
    </div>
  );
}
