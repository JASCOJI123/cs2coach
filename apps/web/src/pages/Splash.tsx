import { useState } from 'react';
import './splash.css';
import logo from './brand/logo.svg';
import { faceitLoginUrl, hasAuthToken } from '../lib/api';
import { navigate } from '../App';
import { LanguageSwitcher, useI18n } from '../lib/i18n';
import { wt } from '../lib/webText';

/** Public landing page. Signing in goes through FACEIT OAuth on the API. */
export default function Splash() {
  const { t, lang } = useI18n();
  const [redirecting, setRedirecting] = useState(false);
  const signedIn = hasAuthToken();

  const signIn = () => {
    if (signedIn) { navigate('home'); return; }
    setRedirecting(true);
    window.location.assign(faceitLoginUrl());
  };

  const cta = (
    <button className="primary landing-cta" onClick={signIn} disabled={redirecting}>
      <span className="cta-icon">◈</span>
      {redirecting ? wt(lang, 'signingIn') : signedIn ? wt(lang, 'openDashboard') : wt(lang, 'signIn')}
    </button>
  );

  const features = [
    { icon: '⌁', title: wt(lang, 'f1Title'), body: wt(lang, 'f1Body') },
    { icon: '◈', title: wt(lang, 'f2Title'), body: wt(lang, 'f2Body') },
    { icon: '✈', title: wt(lang, 'f3Title'), body: wt(lang, 'f3Body') },
  ];
  const steps = [wt(lang, 'step1'), wt(lang, 'step2'), wt(lang, 'step3')];

  return (
    <main className="landing">
      <div className="splash-glow" />
      <header className="landing-top">
        <img className="landing-logo" src={logo} alt="CS2USTOZ — Powered by JASCOAV" />
        <div className="landing-top-actions">
          <LanguageSwitcher />
          <button className="landing-signin" onClick={signIn}>{signedIn ? t('home') : wt(lang, 'signInShort')}</button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">{wt(lang, 'landingEyebrow')}</span>
          <h1>{t('playSmarter')}<br /><em>{t('rankHigher')}</em></h1>
          <p>{wt(lang, 'landingLead')}</p>
          {cta}
          <small className="landing-note">🔒 {wt(lang, 'secureNote')}</small>
        </div>
        <div className="splash-radar landing-radar"><i /><i /><i /><span>AI</span></div>
      </section>

      <section className="landing-features">
        {features.map((f, i) => (
          <article key={f.title} className="landing-feature" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
            <span className="landing-feature-icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <section className="landing-steps">
        <span className="eyebrow">{wt(lang, 'howItWorks')}</span>
        <ol>
          {steps.map((s, i) => <li key={s}><b>{String(i + 1).padStart(2, '0')}</b><span>{s}</span></li>)}
        </ol>
        {cta}
      </section>

      <small className="splash-foot landing-foot">{wt(lang, 'footer')}</small>
    </main>
  );
}
