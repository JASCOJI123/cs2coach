import { useEffect, useState } from 'react';
import { toggleDarkMode } from '../dark-mode';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => { const onTheme=()=>setDark(document.documentElement.classList.contains('dark')); window.addEventListener('cs2coach-theme-change',onTheme); onTheme(); return()=>window.removeEventListener('cs2coach-theme-change',onTheme); },[]);
  const onClick=()=>toggleDarkMode();
  return <button className={`cs2-theme-toggle${dark?' dark':''}`} type="button" onClick={onClick} aria-pressed={dark} aria-label={dark?'Light mode':'Dark mode'} title={dark?'Light mode':'Dark mode'}><span className="theme-icon sun" aria-hidden="true">☼</span><span className="theme-icon moon" aria-hidden="true">☾</span><span className="theme-knob" aria-hidden="true"><i>{dark?'☾':'☼'}</i></span></button>;
}
