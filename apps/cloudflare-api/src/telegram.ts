import { findFaceitAccountByUserId, findUserByTelegramId, listMatchesForUser } from '../../packages/database/src/index';
import type { AppConfig } from '../../api/src/config';

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    from?: { id?: number; first_name?: string };
    text?: string;
  };
};

type TelegramEnv = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_WEBAPP_URL?: string;
};

const DEFAULT_WEBAPP_URL = 'https://jascoji123.github.io/cs2coach/?v=20260913';

function buttonMarkup(webappUrl: string) {
  return { inline_keyboard: [[{ text: '🎮 OPEN AI COACH', web_app: { url: webappUrl } }]] };
}

async function telegramApi(env: TelegramEnv, method: string, body: Record<string, unknown>): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);
}

async function sendMessage(env: TelegramEnv, chatId: number, text: string, webapp = false): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (webapp) body.reply_markup = buttonMarkup(env.TELEGRAM_WEBAPP_URL ?? DEFAULT_WEBAPP_URL);
  await telegramApi(env, 'sendMessage', body);
}

export async function handleTelegramWebhook(request: Request, env: TelegramEnv, config: AppConfig): Promise<Response> {
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const received = request.headers.get('x-telegram-bot-api-secret-token');
    if (received !== env.TELEGRAM_WEBHOOK_SECRET) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  const update = await request.json() as TelegramUpdate;
  const message = update.message;
  const chatId = message?.chat?.id;
  const telegramId = message?.from?.id;
  if (!chatId || !telegramId) return Response.json({ ok: true });

  const command = (message.text ?? '').trim().split(/\s+/, 1)[0].toLowerCase().split('@')[0];
  const webappUrl = env.TELEGRAM_WEBAPP_URL ?? DEFAULT_WEBAPP_URL;

  try {
    switch (command) {
      case '/start': {
        const name = message.from?.first_name ?? 'coach';
        await sendMessage(env, chatId, `Welcome, ${name}! I'm your CS2 AI Coach.\n\nConnect your FACEIT account in the Mini App, then use the coach during your matches.\n\n/help — usage\n/profile — FACEIT status\n/matches — recent matches`, true);
        break;
      }
      case '/help':
        await sendMessage(env, chatId, 'Commands:\n/start — welcome + open the Mini App\n/profile — your FACEIT connection\n/matches — recent matches\n/coach — open the live coach\n/settings — environment info');
        break;
      case '/profile': {
        const user = await findUserByTelegramId(config.db, telegramId);
        if (!user) await sendMessage(env, chatId, 'You have not started the app yet. Press /start.');
        else {
          const account = await findFaceitAccountByUserId(config.db, user.id);
          if (account) await sendMessage(env, chatId, `FACEIT: connected\nNickname: ${account.nickname}\nSkill level: ${account.skillLevel ?? 'n/a'}`);
          else await sendMessage(env, chatId, 'FACEIT: not connected yet.\nOpen the Mini App and press "Connect FACEIT".');
        }
        break;
      }
      case '/matches': {
        const user = await findUserByTelegramId(config.db, telegramId);
        if (!user) { await sendMessage(env, chatId, 'No matches yet — press /start then connect FACEIT.'); break; }
        const matches = await listMatchesForUser(config.db, { userId: user.id, limit: 10 });
        if (matches.length === 0) { await sendMessage(env, chatId, 'No matches recorded yet. Finished matches will appear here after connecting FACEIT.'); break; }
        const lines = matches.map((m) => `• ${m.map ?? 'unknown map'} — ${m.status} (${m.scoreA ?? 0}:${m.scoreB ?? 0})`);
        await sendMessage(env, chatId, `Your recent matches:\n${lines.join('\n')}`);
        break;
      }
      case '/coach':
        await sendMessage(env, chatId, 'Opening the live coach…', true);
        break;
      case '/settings':
        await sendMessage(env, chatId, `Environment: ${config.env.nodeEnv}\nMini App: ${webappUrl}\nCloudflare Worker backend is active.`);
        break;
      default:
        if (message.text?.startsWith('/')) await sendMessage(env, chatId, 'Unknown command. Press /help to see available commands.');
    }
  } catch (error) {
    config.logger.warn('telegram_webhook_failed', { error: error instanceof Error ? error.message : String(error) });
  }

  return Response.json({ ok: true });
}

export async function configureTelegramWebhook(env: TelegramEnv, config: AppConfig): Promise<void> {
  const webhookUrl = (env as TelegramEnv & { TELEGRAM_WEBHOOK_URL?: string }).TELEGRAM_WEBHOOK_URL;
  if (!env.TELEGRAM_BOT_TOKEN || !webhookUrl) return;
  await telegramApi(env, 'setWebhook', {
    url: webhookUrl,
    drop_pending_updates: true,
    ...(env.TELEGRAM_WEBHOOK_SECRET ? { secret_token: env.TELEGRAM_WEBHOOK_SECRET } : {}),
  });
  await telegramApi(env, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text: '🎮 AI COACH', web_app: { url: env.TELEGRAM_WEBAPP_URL ?? DEFAULT_WEBAPP_URL } },
  });
  config.logger.info('telegram_webhook_configured', { webhookUrl });
}
