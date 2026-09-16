import { useEffect, useState } from 'react';
import { toggleDarkMode } from '../dark-mode';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => { const onTheme = () => setDark(document.documentElement.classList.contains('dark')); window.addEventListener('cs2coach-theme-change', onTheme); onTheme(); return () => window.removeEventListener('cs2coach-theme-change', onTheme); }, []);
  const onClick = () => { toggleDarkMode(); setDark(document.documentElement.classList.contains('dark')); };
  return (
    <>
      <style>{` .cs2-theme-toggle{position:fixed;top:calc(env(safe-area-inset-top) + 10px);right:14px;z-index:1000;width:72px;height:38px;padding:3px;border:1px solid rgba(120,135,150,.28);border-radius:999px;background:rgba(255,255,255,.08);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 8px 22px rgba(0,0,0,.16);cursor:pointer;transition:.28s ease}.cs2-theme-toggle:active{transform:scale(.96)}.cs2-theme-toggle .track{position:absolute;inset:3px;border-radius:999px;background:linear-gradient(135deg,rgba(255,255,255,.10),rgba(255,255,255,.03));overflow:hidden}.cs2-theme-toggle .knob{position:absolute;top:3px;left:3px;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:17px;line-height:1;background:linear-gradient(145deg,#ffffff,#dfe5ea);box-shadow:0 3px 10px rgba(0,0,0,.25);transition:transform .32s cubic-bezier(.2,.8,.2,1),background .28s ease}.cs2-theme-toggle.dark .knob{transform:translateX(34px);background:linear-gradient(145deg,#303944,#111820);box-shadow:0 3px 12px rgba(0,0,0,.42)}.cs2-theme-toggle .moon,.cs2-theme-toggle .sun{position:absolute;top:50%;transform:translateY(-50%);font-size:13px;line-height:1;transition:opacity .2s}.cs2-theme-toggle .moon{left:10px;color:#6bd7ff}.cs2-theme-toggle .sun{right:10px;color:#ffb84d}.cs2-theme-toggle.dark .moon{opacity:.35}.cs2-theme-toggle:not(.dark) .sun{opacity:.35}.cs2-theme-toggle.dark{border-color:rgba(87,216,255,.24)}html:not(.dark) .cs2-theme-toggle{background:rgba(20,30,40,.07);border-color:rgba(20,30,40,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 8px 22px rgba(20,30,40,.12)} `}</style>
      <button className={`cs2-theme-toggle${dark ? ' dark' : ''}`} type="button" onClick={onClick} aria-pressed={dark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
        <span className="track" aria-hidden="true" />
        <span className="moon" aria-hidden="true">☾</span>
        <span className="sun" aria-hidden="true">☀</span>
        <span className="knob" aria-hidden="true">{dark ? '☾' : '☀'}</span>
      </button>
    </>
  );
}
