import { useEffect, useState } from 'react';
import { applyTheme, toggleDarkMode } from '../dark-mode';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const onTheme = () => setDark(document.documentElement.classList.contains('dark'));
    window.addEventListener('cs2coach-theme-change', onTheme);
    onTheme();
    return () => window.removeEventListener('cs2coach-theme-change', onTheme);
  }, []);

  const onClick = () => {
    toggleDarkMode();
    const next = document.documentElement.classList.contains('dark');
    setDark(next);
    window.dispatchEvent(new Event('cs2coach-theme-change'));
  };

  return (
    <button className="dark-mode-toggle" type="button" onClick={onClick} aria-label={dark ? 'Light mode' : 'Dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      <span className="icon" aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
      <span>{dark ? 'LIGHT' : 'DARK'}</span>
    </button>
  );
}
