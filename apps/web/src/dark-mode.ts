const MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function initSystemTheme(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};

  const media = window.matchMedia(MEDIA_QUERY);

  const apply = (dark: boolean): void => {
    document.documentElement.classList.toggle('dark', dark);
  };

  apply(media.matches);

  const onChange = (event: MediaQueryListEvent): void => {
    apply(event.matches);
  };

  media.addEventListener?.('change', onChange);

  return () => media.removeEventListener?.('change', onChange);
}
