import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { createLogger, loadEnv, type Logger } from '@cs2coach/shared';
import { getDb, closeDb, findUserByTelegramId, findFaceitAccountByUserId, listMatchesForUser } from '@cs2coach/database';

const logger: Logger = createLogger('bot');
const DEFAULT_WEBAPP_URL = 'https://jascoji123.github.io/cs2coach/v2/';
const DEFAULT_WEBHOOK_URL = 'https://cs2coach-bot-1z3b.onrender.com/telegram/webhook';

export async function startBot(): Promise<void> {
  const env = loadEnv(); const token = env.telegramBotToken;
  if (!token || token === 'PLACEHOLDER_BOT_TOKEN') { logger.warn('bot_not_started', { reason: 'TELEGRAM_BOT_TOKEN not configured' }); return; }
  const db = getDb(env.databaseUrl ?? 'postgresql://localhost:5432/cs2coach');
  const webappUrl = env.telegramWebappUrl ?? DEFAULT_WEBAPP_URL; const webhookUrl = env.telegramWebhookUrl ?? DEFAULT_WEBHOOK_URL; const bot = new Bot(token);
  const openCoachKeyboard = () => new InlineKeyboard().webApp('🎮 OPEN AI COACH', webappUrl);
  try { await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: '🎮 AI COACH', web_app: { url: webappUrl } } }); } catch (err) { logger.warn('menu_button_failed', { error: err instanceof Error ? err.message : String(err) }); }
  bot.command('start', async (ctx) => { const name = ctx.from?.first_name ?? 'coach'; await ctx.reply(`Welcome, ${name}! I'm your **CS2 AI Coach**.\n\nConnect your FACEIT account, then press **OPEN AI COACH** to launch the Mini App and get live tactical advice during your matches.\n\nCommands:\n/help — usage\n/profile — FACEIT status\n/matches — recent matches`, { reply_markup: openCoachKeyboard() }); });
  bot.command('help', async (ctx) => { await ctx.reply('Commands:\n/start — welcome + open the Mini App\n/profile — your FACEIT connection\n/matches — recent matches\n/coach — open the live coach\n/settings — environment info'); });
  bot.command('profile', async (ctx) => { const telegramId = ctx.from!.id; const user = await findUserByTelegramId(db, telegramId); if (!user) { await ctx.reply('You have not started the app yet. Press /start.'); return; } const account = await findFaceitAccountByUserId(db, user.id); if (account) await ctx.reply(`FACEIT: connected\nNickname: ${account.nickname}\nSkill level: ${account.skillLevel ?? 'n/a'}`); else await ctx.reply('FACEIT: not connected yet.\nOpen the Mini App and press "Connect FACEIT".'); });
  bot.command('matches', async (ctx) => { const telegramId = ctx.from!.id; const user = await findUserByTelegramId(db, telegramId); if (!user) { await ctx.reply('No matches yet — press /start then connect FACEIT.'); return; } const matches = await listMatchesForUser(db, { userId: user.id, limit: 10 }); if (matches.length === 0) { await ctx.reply('No matches recorded yet. Finished matches will appear here after connecting FACEIT.'); return; } const lines = matches.map((m) => `• ${m.map ?? 'unknown map'} — ${m.status} (${m.scoreA ?? 0}:${m.scoreB ?? 0})`); await ctx.reply(`Your recent matches:\n${lines.join('\n')}`); });
  bot.command('coach', async (ctx) => { await ctx.reply('Opening the live coach…', { reply_markup: openCoachKeyboard() }); });
  bot.command('settings', async (ctx) => { await ctx.reply(`Environment: ${env.nodeEnv}${env.isDemoMode ? ' (DEMO MODE)' : ''}\nMini App: ${webappUrl}\nDemo data is only available in non-production builds.`); });
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
  logger.info('bot_started', { username: bot.botInfo.username, webappUrl, webhookUrl });
  const shutdown = async () => { logger.info('bot_shutdown', {}); try { await bot.api.deleteWebhook({ drop_pending_updates: false }); } catch (err) { logger.warn('webhook_delete_failed', { error: err instanceof Error ? err.message : String(err) }); } server.close(); await closeDb(); };
  process.on('SIGINT', () => void shutdown()); process.on('SIGTERM', () => void shutdown());
}
const isMain = require.main === module;
if (isMain) startBot().catch((err) => { logger.error('bot_boot_failed', { error: err instanceof Error ? err.message : String(err) }); process.exit(1); });
