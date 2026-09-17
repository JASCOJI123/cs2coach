const STORAGE_KEY = 'cs2coach.dark-mode';

function emitThemeChange(): void {
  window.dispatchEvent(new Event('cs2coach-theme-change'));
}

export function applyDarkMode(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem(STORAGE_KEY, dark ? '1' : '0'); } catch {}
  emitThemeChange();
}

export function toggleDarkMode(): void {
  applyDarkMode(!document.documentElement.classList.contains('dark'));
}

export function initDarkMode(): void {
  let stored = '';
  try { stored = localStorage.getItem(STORAGE_KEY) ?? ''; } catch {}
  const dark = stored ? stored === '1' : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  document.documentElement.classList.toggle('dark', dark);
}

if (typeof document !== 'undefined') initDarkMode();
