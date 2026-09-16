const STORAGE_KEY = 'cs2coach.dark-mode';

function emitThemeChange() {
  window.dispatchEvent(new Event('cs2coach-theme-change'));
}

export function applyDarkMode(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem(STORAGE_KEY, dark ? '1' : '0');
  } catch {
    // Ignore storage failures in Telegram WebView/private browsing.
  }
  emitThemeChange();
}

export function toggleDarkMode() {
  const dark = document.documentElement.classList.contains('dark');
  applyDarkMode(!dark);
}

export function initDarkMode() {
  let stored = '';
  try {
    stored = localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    stored = '';
  }
  const dark = stored ? stored === '1' : window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  document.documentElement.classList.toggle('dark', dark);
}

if (typeof document !== 'undefined') initDarkMode();
