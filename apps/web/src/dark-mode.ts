const STORAGE_KEY = 'cs2coach-theme';

export function initDarkMode(): void {
  if (typeof document === 'undefined') return;

  const saved = window.localStorage.getItem(STORAGE_KEY);
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  applyTheme(saved === 'dark' || (saved !== 'light' && systemDark) ? 'dark' : 'light');
}

export function toggleDarkMode(): void {
  if (typeof document === 'undefined') return;
  applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
}

export function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme === 'light');
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new Event('cs2coach-theme-change'));
}
