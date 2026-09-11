/**
 * Telegram Mini App SDK glue (spec §8): taps window.Telegram.WebApp for
 * initData + theme. Respects the platform's color scheme for the tactical HUD.
 */
export interface TgWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: { id?: number; first_name?: string; username?: string };
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function getTelegramWebApp(): TgWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
}

export function isDarkScheme(): boolean {
  return getTelegramWebApp()?.colorScheme === 'dark' || !window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function initTelegram(): void {
  const tgApp = getTelegramWebApp();
  if (!tgApp) return;
  tgApp.ready();
  tgApp.expand();
  try {
    tgApp.setHeaderColor?.('#0b0f14');
  } catch {
    /* headers optional */
  }
  // Telegram injects its own stylesheet to root classes
  document.documentElement.classList.add(`tg-${tgApp.colorScheme}`);
}