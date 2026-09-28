<<<<<<< Updated upstream
import{useEffect,useState}from'react';import'./splash.css';import logo from './brand/logo.svg';import{api,clearAuthToken,hasAuthToken,setAuthToken}from'../lib/api';import{getInitData}from'../lib/telegram';import{navigate}from'../App';import{LanguageSwitcher,useI18n}from'../lib/i18n';import{ui}from'../lib/uiText';const LOGGED_OUT_KEY='cs2coach.logged_out.v1';export function markLoggedOut(){try{sessionStorage.setItem(LOGGED_OUT_KEY,'1')}catch{/* storage unavailable */}}export default function Splash(){const{t,lang}=useI18n();const[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[loggedOut,setLoggedOut]=useState(false);const login=async()=>{setError(null);setBusy(true);try{try{sessionStorage.removeItem(LOGGED_OUT_KEY)}catch{/* storage unavailable */}const initData=getInitData();if(!initData){setError(lang==='uz'?'Ilovani Telegram botidagi "AI MURABBIYNI OCHISH" tugmasi orqali oching.':lang==='ru'?'Откройте приложение через кнопку «ОТКРЫТЬ AI-ТРЕНЕРА» в Telegram-боте.':'Open this app from the Telegram bot via "OPEN AI COACH".');return}const auth=await api.login(initData);setAuthToken(auth.token);navigate('home')}catch(err){setError((err as Error).message)}finally{setBusy(false)}};useEffect(()=>{let was=false;try{was=sessionStorage.getItem(LOGGED_OUT_KEY)==='1'}catch{/* storage unavailable */}if(was){clearAuthToken();setLoggedOut(true);return}void(async()=>{try{if(hasAuthToken()){try{await api.faceitStatus();navigate('home');return}catch(err){if((err as{status?:number}).status!==401)throw err;clearAuthToken()}}await login()}catch(err){setError((err as Error).message)}})()},[]);return <main className="splash branded-splash"><LanguageSwitcher/><div className="splash-glow"/><div className="splash-brand"><img className="splash-logo" src={logo} alt="CS2USTOZ — Powered by JASCOAV"/></div><div className="splash-center"><span className="eyebrow">{t('tactical')}</span><h1>{t('playSmarter')}<br/><em>{t('rankHigher')}</em></h1><p>{t('reviewPerformance')}</p><div className="splash-radar"><i/><i/><i/><span>AI</span></div></div>{busy&&<div className="splash-status"><span className="pulse"/> {t('connecting')}</div>}{loggedOut&&!busy&&<button className="primary splash-login" onClick={login}>{ui(lang,'loginAgain')}</button>}{error&&<p className="error-banner">{error}</p>}<small className="splash-foot">{ui(lang,'splashFoot')}</small></main>}
=======
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
>>>>>>> Stashed changes
