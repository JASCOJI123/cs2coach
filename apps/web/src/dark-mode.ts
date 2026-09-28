/**
 * The app shares the landing page's always-dark "war room" look (app-skin.css),
 * so the theme no longer follows the OS light/dark preference.
 */
export function initSystemTheme(): () => void {
  if (typeof document === 'undefined') return () => {};
  document.documentElement.classList.add('dark');
  return () => {};
}
