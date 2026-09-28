/**
 * Telegram bot texts. The bot is only a notification channel for the website,
 * so every button is a plain URL back to the site (no Mini App buttons).
 */
export type BotLocale = 'uz' | 'ru' | 'en';

export function botLocale(languageCode?: string | null): BotLocale {
  const code = (languageCode ?? '').toLowerCase();
  if (code.startsWith('ru')) return 'ru';
  if (code.startsWith('en')) return 'en';
  return 'uz';
}

/** Payload of `/start link_<token>` deep links, or null. */
export function parseLinkPayload(text: string | undefined): string | null {
  const match = /^\/start(?:@\w+)?\s+link_([A-Za-z0-9_-]{16,64})\s*$/.exec((text ?? '').trim());
  return match ? match[1]! : null;
}

export function siteUrl(base: string, hashPath = '/home'): string {
  const url = new URL(base);
  url.hash = hashPath;
  return url.toString();
}

interface BotCopy {
  welcome: (name: string) => string;
  linked: string;
  linkInvalid: string;
  notLinked: string;
  stopped: string;
  resumed: string;
  help: string;
  openSite: string;
  openSettings: string;
  faceitConnected: (nickname: string, level: string, elo: string) => string;
  noMatches: string;
  recentMatches: string;
  unknown: string;
}

export const botCopy: Record<BotLocale, BotCopy> = {
  uz: {
    welcome: (name) => `Salom, ${name}! Bu CS2USTOZ bildirishnoma boti.\n\nMurabbiy endi saytda ishlaydi. Match boshlanganda va tugaganda xabar olish uchun saytga FACEIT orqali kiring va Sozlamalar → "Telegram'ni ulash" tugmasini bosing.`,
    linked: '✅ Telegram ulandi. Endi match boshlanganda va tugaganda shu yerga xabar keladi.\n\n/stop — bildirishnomalarni o‘chirish',
    linkInvalid: '⚠️ Havola eskirgan yoki noto‘g‘ri. Saytdagi Sozlamalardan yangi havola oling.',
    notLinked: 'Bu Telegram hali saytdagi akkauntga ulanmagan. Saytdagi Sozlamalar → "Telegram\'ni ulash" tugmasini bosing.',
    stopped: '🔕 Bildirishnomalar o‘chirildi. Qayta yoqish: /resume',
    resumed: '🔔 Bildirishnomalar yoqildi.',
    help: 'Buyruqlar:\n/profile — FACEIT profilingiz\n/matches — oxirgi matchlar\n/stop — bildirishnomalarni o‘chirish\n/resume — bildirishnomalarni yoqish\n\nAsosiy ish saytda bajariladi.',
    openSite: '🌐 Saytni ochish',
    openSettings: '⚙ Sozlamalarni ochish',
    faceitConnected: (nickname, level, elo) => `FACEIT: ${nickname}\nDaraja: ${level} · ELO: ${elo}`,
    noMatches: 'Hozircha matchlar yo‘q.',
    recentMatches: 'Oxirgi matchlar:',
    unknown: 'Noma’lum buyruq. /help ni bosing.',
  },
  ru: {
    welcome: (name) => `Привет, ${name}! Это бот уведомлений CS2USTOZ.\n\nТренер теперь работает на сайте. Чтобы получать уведомления о начале и конце матчей, войдите на сайт через FACEIT и нажмите Настройки → «Подключить Telegram».`,
    linked: '✅ Telegram подключён. Теперь сюда будут приходить уведомления о начале и конце матчей.\n\n/stop — отключить уведомления',
    linkInvalid: '⚠️ Ссылка устарела или неверна. Получите новую в Настройках на сайте.',
    notLinked: 'Этот Telegram ещё не привязан к аккаунту на сайте. Нажмите Настройки → «Подключить Telegram» на сайте.',
    stopped: '🔕 Уведомления отключены. Включить снова: /resume',
    resumed: '🔔 Уведомления включены.',
    help: 'Команды:\n/profile — ваш профиль FACEIT\n/matches — последние матчи\n/stop — отключить уведомления\n/resume — включить уведомления\n\nВся основная работа — на сайте.',
    openSite: '🌐 Открыть сайт',
    openSettings: '⚙ Открыть настройки',
    faceitConnected: (nickname, level, elo) => `FACEIT: ${nickname}\nУровень: ${level} · ELO: ${elo}`,
    noMatches: 'Матчей пока нет.',
    recentMatches: 'Последние матчи:',
    unknown: 'Неизвестная команда. Нажмите /help.',
  },
  en: {
    welcome: (name) => `Hi, ${name}! This is the CS2USTOZ notification bot.\n\nThe coach now lives on the website. To get alerts when your matches start and finish, sign in on the site with FACEIT and press Settings → "Connect Telegram".`,
    linked: '✅ Telegram connected. You will get a message here when your matches start and finish.\n\n/stop — turn notifications off',
    linkInvalid: '⚠️ This link is expired or invalid. Get a new one from Settings on the website.',
    notLinked: 'This Telegram account is not linked to a website account yet. Press Settings → "Connect Telegram" on the site.',
    stopped: '🔕 Notifications turned off. Turn back on: /resume',
    resumed: '🔔 Notifications turned on.',
    help: 'Commands:\n/profile — your FACEIT profile\n/matches — recent matches\n/stop — turn notifications off\n/resume — turn notifications on\n\nEverything else happens on the website.',
    openSite: '🌐 Open website',
    openSettings: '⚙ Open settings',
    faceitConnected: (nickname, level, elo) => `FACEIT: ${nickname}\nLevel: ${level} · ELO: ${elo}`,
    noMatches: 'No matches yet.',
    recentMatches: 'Recent matches:',
    unknown: 'Unknown command. Press /help.',
  },
};
