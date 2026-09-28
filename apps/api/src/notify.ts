/**
 * Telegram is only a notification channel for the website. Messages carry a
 * plain URL button back to the site — never a Mini App (web_app) button.
 */
import { claimNotification, getNotificationTarget } from '@cs2coach/database';
import type { AppConfig } from './config';

export type NotifyLocale = 'uz' | 'ru' | 'en';
export type NotificationKind = 'match_started' | 'match_finished';

let cachedBotUsername: string | null = null;

export function normalizeLocale(value: unknown): NotifyLocale {
  return value === 'ru' || value === 'en' ? value : 'uz';
}

/** Build a link to a hash route of the website, e.g. webLink(config, '/match/abc'). */
export function webLink(config: AppConfig, hashPath = '/home'): string {
  const url = new URL(config.env.webAppUrl);
  url.hash = hashPath;
  return url.toString();
}

async function telegramCall<T>(config: AppConfig, method: string, body: Record<string, unknown>): Promise<T | null> {
  const token = config.env.telegramBotToken;
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  if (!response.ok || !json?.ok) throw new Error(`Telegram ${method} failed: ${json?.description ?? response.status}`);
  return json.result ?? null;
}

export async function getBotUsername(config: AppConfig): Promise<string | null> {
  if (config.env.telegramBotUsername) return config.env.telegramBotUsername;
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = await telegramCall<{ username?: string }>(config, 'getMe', {});
    cachedBotUsername = me?.username ?? null;
  } catch (error) {
    config.logger.warn('telegram_get_me_failed', { error: error instanceof Error ? error.message : String(error) });
  }
  return cachedBotUsername;
}

export async function sendTelegramMessage(
  config: AppConfig,
  chatId: number,
  text: string,
  button?: { text: string; url: string },
): Promise<void> {
  await telegramCall(config, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
  });
}

interface MatchInfo { faceitMatchId: string; map: string | null; scoreA?: number; scoreB?: number; /** When the event happened; stale or pre-link events are skipped. */ eventAtMs?: number | null; }

const MAX_EVENT_AGE_MS = 3 * 60 * 60_000;

const copy: Record<NotifyLocale, Record<NotificationKind, (m: MatchInfo) => string> & { open: string; analysis: string }> = {
  uz: {
    match_started: (m) => `🎮 FACEIT match boshlandi${m.map ? ` — ${m.map}` : ''}.\nJonli taktik maslahatlar saytda tayyor.`,
    match_finished: (m) => `🏁 Match yakunlandi${m.map ? ` — ${m.map}` : ''}: ${m.scoreA ?? 0}:${m.scoreB ?? 0}.\nAI tahlil va mashg'ulot rejasini oling.`,
    open: '⌁ Jonli murabbiyni ochish',
    analysis: '◈ Tahlilni ochish',
  },
  ru: {
    match_started: (m) => `🎮 Матч FACEIT начался${m.map ? ` — ${m.map}` : ''}.\nТактические подсказки уже на сайте.`,
    match_finished: (m) => `🏁 Матч завершён${m.map ? ` — ${m.map}` : ''}: ${m.scoreA ?? 0}:${m.scoreB ?? 0}.\nПолучите AI-разбор и план тренировок.`,
    open: '⌁ Открыть live-тренера',
    analysis: '◈ Открыть разбор',
  },
  en: {
    match_started: (m) => `🎮 Your FACEIT match has started${m.map ? ` — ${m.map}` : ''}.\nLive tactical calls are ready on the site.`,
    match_finished: (m) => `🏁 Match finished${m.map ? ` — ${m.map}` : ''}: ${m.scoreA ?? 0}:${m.scoreB ?? 0}.\nGet your AI review and training plan.`,
    open: '⌁ Open live coach',
    analysis: '◈ Open analysis',
  },
};

/**
 * Send a match notification once per (user, kind, match). Silently skips users
 * without a linked Telegram chat or with notifications turned off, and never
 * throws — notification failures must not break syncing or webhooks.
 */
export async function notifyMatchEvent(config: AppConfig, userId: string, kind: NotificationKind, match: MatchInfo): Promise<void> {
  try {
    if (!config.env.telegramBotToken) return;
    const target = await getNotificationTarget(config.db, userId);
    if (!target?.telegramChatId || !target.notificationsEnabled) return;
    if (match.eventAtMs != null) {
      const linkedAtMs = target.telegramLinkedAt?.getTime() ?? 0;
      if (match.eventAtMs < linkedAtMs || Date.now() - match.eventAtMs > MAX_EVENT_AGE_MS) return;
    }
    if (!await claimNotification(config.db, { userId, kind, ref: match.faceitMatchId })) return;
    const t = copy[normalizeLocale(target.locale)];
    const route = kind === 'match_started' ? `/match/${encodeURIComponent(match.faceitMatchId)}` : `/post-match/${encodeURIComponent(match.faceitMatchId)}`;
    await sendTelegramMessage(config, target.telegramChatId, t[kind](match), {
      text: kind === 'match_started' ? t.open : t.analysis,
      url: webLink(config, route),
    });
    config.logger.info('telegram_notification_sent', { userId, kind, matchId: match.faceitMatchId });
  } catch (error) {
    config.logger.warn('telegram_notification_failed', { userId, kind, error: error instanceof Error ? error.message : String(error) });
  }
}
