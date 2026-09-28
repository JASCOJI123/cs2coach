import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { Bot, InlineKeyboard, webhookCallback, type Context } from 'grammy';
import { botCopy, botLocale, createLogger, loadEnv, parseLinkPayload, siteUrl, type Logger } from '@cs2coach/shared';
import { getDb, closeDb, findUserByTelegramId, findFaceitAccountByUserId, linkTelegramByToken, listMatchesForUser, setNotificationsEnabledByTelegramId } from '@cs2coach/database';

const logger: Logger = createLogger('bot');
const DEFAULT_WEBHOOK_URL = 'https://cs2coach-bot-1z3b.onrender.com/telegram/webhook';

/**
 * The website is the product; this bot only delivers notifications and links
 * a Telegram chat to a website account via `/start link_<token>` deep links.
 */
export async function startBot(): Promise<void> {
  const env = loadEnv(); const token = env.telegramBotToken;
  if (!token || token === 'PLACEHOLDER_BOT_TOKEN') { logger.warn('bot_not_started', { reason: 'TELEGRAM_BOT_TOKEN not configured' }); return; }
  const db = getDb(env.databaseUrl ?? 'postgresql://localhost:5432/cs2coach');
  const webhookUrl = env.telegramWebhookUrl ?? DEFAULT_WEBHOOK_URL; const bot = new Bot(token);
  const copy = (ctx: Context) => botCopy[botLocale(ctx.from?.language_code)];
  const link = (text: string, hashPath = '/home') => new InlineKeyboard().url(text, siteUrl(env.webAppUrl, hashPath));
  const settingsKeyboard = (ctx: Context) => link(copy(ctx).openSettings, '/settings');

  try {
    await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } });
    await bot.api.setMyCommands([
      { command: 'profile', description: 'FACEIT profile' },
      { command: 'matches', description: 'Recent matches' },
      { command: 'stop', description: 'Turn notifications off' },
      { command: 'resume', description: 'Turn notifications on' },
      { command: 'help', description: 'Help' },
    ]);
  } catch (err) { logger.warn('bot_menu_setup_failed', { error: err instanceof Error ? err.message : String(err) }); }

  bot.command('start', async (ctx) => {
    const t = copy(ctx); const linkToken = parseLinkPayload(ctx.message?.text);
    if (linkToken) {
      if (ctx.chat.type !== 'private') { await ctx.reply(t.linkInvalid); return; }
      const userId = await linkTelegramByToken(db, { token: linkToken, telegramId: ctx.from!.id, chatId: ctx.chat.id, username: ctx.from?.username ?? null });
      logger.info('telegram_link_attempt', { linked: Boolean(userId) });
      await ctx.reply(userId ? t.linked : t.linkInvalid, { reply_markup: userId ? link(t.openSite) : settingsKeyboard(ctx) });
      return;
    }
    await ctx.reply(t.welcome(ctx.from?.first_name ?? 'coach'), { reply_markup: settingsKeyboard(ctx) });
  });
  bot.command('help', async (ctx) => { const t = copy(ctx); await ctx.reply(t.help, { reply_markup: link(t.openSite) }); });
  const toggle = (enabled: boolean) => async (ctx: Context) => { const t = copy(ctx); const changed = await setNotificationsEnabledByTelegramId(db, ctx.from!.id, enabled); if (changed) await ctx.reply(enabled ? t.resumed : t.stopped); else await ctx.reply(t.notLinked, { reply_markup: settingsKeyboard(ctx) }); };
  bot.command('stop', toggle(false));
  bot.command('resume', toggle(true));
  bot.command('profile', async (ctx) => { const t = copy(ctx); const user = await findUserByTelegramId(db, ctx.from!.id); const account = user ? await findFaceitAccountByUserId(db, user.id) : null; if (!account) { await ctx.reply(t.notLinked, { reply_markup: settingsKeyboard(ctx) }); return; } await ctx.reply(t.faceitConnected(account.nickname, String(account.skillLevel ?? '—'), String(account.elo ?? '—')), { reply_markup: link(t.openSite) }); });
  bot.command('matches', async (ctx) => { const t = copy(ctx); const user = await findUserByTelegramId(db, ctx.from!.id); if (!user) { await ctx.reply(t.notLinked, { reply_markup: settingsKeyboard(ctx) }); return; } const matches = await listMatchesForUser(db, { userId: user.id, limit: 10 }); if (matches.length === 0) { await ctx.reply(t.noMatches, { reply_markup: link(t.openSite) }); return; } const lines = matches.map((m) => `• ${m.map ?? '—'} — ${m.status} (${m.scoreA ?? 0}:${m.scoreB ?? 0})`); await ctx.reply(`${t.recentMatches}\n${lines.join('\n')}`, { reply_markup: link(t.openSite, '/matches') }); });
  bot.on('message:text', async (ctx) => { if (ctx.message.text.startsWith('/')) await ctx.reply(copy(ctx).unknown); });
  bot.catch((err) => logger.error('bot_error', { error: err.message }));
  await bot.init();
  const webhookHandler = webhookCallback(bot, 'http'); const secret = env.telegramWebhookSecret;
  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health' || req.url === '/') { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: true, service: 'cs2coach-bot' })); return; }
    if (req.url === '/telegram/webhook' && req.method === 'POST') { if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) { res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, error: 'unauthorized' })); return; } try { await webhookHandler(req, res); } catch (err) { logger.error('webhook_handler_failed', { error: err instanceof Error ? err.message : String(err) }); if (!res.headersSent) { res.writeHead(500); res.end('internal error'); } } return; }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not_found' }));
  });
  server.listen(env.port, '0.0.0.0', () => logger.info('health_server_started', { port: env.port }));
  await bot.api.setWebhook(webhookUrl, { drop_pending_updates: true, ...(secret ? { secret_token: secret } : {}) });
  logger.info('bot_started', { username: bot.botInfo.username, webAppUrl: env.webAppUrl, webhookUrl });
  const shutdown = async () => { logger.info('bot_shutdown', {}); try { await bot.api.deleteWebhook({ drop_pending_updates: false }); } catch (err) { logger.warn('webhook_delete_failed', { error: err instanceof Error ? err.message : String(err) }); } server.close(); await closeDb(); };
  process.on('SIGINT', () => void shutdown()); process.on('SIGTERM', () => void shutdown());
}
const isMain = require.main === module;
if (isMain) startBot().catch((err) => { logger.error('bot_boot_failed', { error: err instanceof Error ? err.message : String(err) }); process.exit(1); });
