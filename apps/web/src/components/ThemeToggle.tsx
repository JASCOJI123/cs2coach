import { useEffect, useState } from 'react';
import { toggleDarkMode } from '../dark-mode';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const onTheme = () => setDark(document.documentElement.classList.contains('dark'));
    window.addEventListener('cs2coach-theme-change', onTheme);
    onTheme();
    return () => window.removeEventListener('cs2coach-theme-change', onTheme);
  }, []);

  return (
    <button
      className={`theme-switch${dark ? ' dark' : ''}`}
      type="button"
      onClick={toggleDarkMode}
      aria-pressed={dark}
      aria-label={dark ? 'Light mode' : 'Dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <span className="switch-track"><span className="switch-socket" aria-hidden="true" /></span>
      <span className="switch-knob" aria-hidden="true"><span className="switch-icon">{dark ? '☾' : '☀'}</span></span>
    </button>
  );
}
