/**
 * Telegram bot (spec §8). Commands:
 *   /start   — welcome + OPEN AI COACH Mini App button
 *   /help    — list of commands
 *   /profile — FACEIT connection status
 *   /matches — your recent matches
 *   /coach   — open the live coach Mini App
 *   /settings— demo/connection info
 *
 * The Mini App authenticates independently via Telegram initData (POST
 * /api/auth/telegram), so the bot only needs the webapp URL to deep-link.
 */
import { Bot, InlineKeyboard } from 'grammy';
import { createLogger, loadEnv, type Logger } from '@cs2coach/shared';
import { getDb, closeDb, findUserByTelegramId, findFaceitAccountByUserId, listMatchesForUser } from '@cs2coach/database';

const logger: Logger = createLogger('bot');

export async function startBot(): Promise<void> {
  const env = loadEnv();
  const token = env.telegramBotToken;
  if (!token || token === 'PLACEHOLDER_BOT_TOKEN') {
    logger.warn('bot_not_started', { reason: 'TELEGRAM_BOT_TOKEN not configured' });
    return;
  }

  const db = getDb(env.databaseUrl ?? 'postgresql://localhost:5432/cs2coach');
  const webappUrl = env.telegramWebappUrl ?? 'http://localhost:5173';

  const bot = new Bot(token);

  const openCoachKeyboard = () =>
    new InlineKeyboard().webApp('🎮 OPEN AI COACH', `${webappUrl}?startapp=coach`);

  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name ?? 'coach';
    await ctx.reply(
      `Welcome, ${name}! I'm your **CS2 AI Coach**.\n\n` +
        `Connect your FACEIT account, then press **OPEN AI COACH** to launch the Mini App and get live tactical advice during your matches.\n\n` +
        `Commands:\n/help — usage\n/profile — FACEIT status\n/matches — recent matches`,
      { reply_markup: openCoachKeyboard() }
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'Commands:\n' +
        '/start — welcome + open the Mini App\n' +
        '/profile — your FACEIT connection\n' +
        '/matches — your recent matches\n' +
        '/coach — open the live coach\n' +
        '/settings — environment info'
    );
  });

  bot.command('profile', async (ctx) => {
    const telegramId = ctx.from!.id;
    const user = await findUserByTelegramId(db, telegramId);
    if (!user) {
      await ctx.reply('You have not started the app yet. Press /start.');
      return;
    }
    const account = await findFaceitAccountByUserId(db, user.id);
    if (account) {
      await ctx.reply(`FACEIT: connected\nNickname: ${account.nickname}\nSkill level: ${account.skillLevel ?? 'n/a'}`);
    } else {
      await ctx.reply('FACEIT: not connected yet.\nOpen the Mini App and press "Connect FACEIT".');
    }
  });

  bot.command('matches', async (ctx) => {
    const telegramId = ctx.from!.id;
    const user = await findUserByTelegramId(db, telegramId);
    if (!user) {
      await ctx.reply('No matches yet — press /start then connect FACEIT.');
      return;
    }
    const matches = await listMatchesForUser(db, { userId: user.id, limit: 10 });
    if (matches.length === 0) {
      await ctx.reply('No matches recorded yet. Finished matches will appear here after connecting FACEIT.');
      return;
    }
    const lines = matches.map(
      (m) => `• ${m.map ?? 'unknown map'} — ${m.status} (${m.scoreA ?? 0}:${m.scoreB ?? 0})`
    );
    await ctx.reply(`Your recent matches:\n${lines.join('\n')}`);
  });

  bot.command('coach', async (ctx) => {
    await ctx.reply('Opening the live coach…', { reply_markup: openCoachKeyboard() });
  });

  bot.command('settings', async (ctx) => {
    await ctx.reply(
      `Environment: ${env.nodeEnv}${env.isDemoMode ? ' (DEMO MODE)' : ''}\n` +
        `Mini App: ${webappUrl}\n` +
        `Demo data is only available in non-production builds.`
    );
  });

  bot.catch((err) => {
    logger.error('bot_error', { error: err.message });
  });

  // Register bot via getUpdates (works on Render Free, no public webhook needed)
  await bot.init();
  logger.info('bot_started', { username: bot.botInfo.username });
  bot.start({ drop_pending_updates: true });

  const shutdown = async () => {
    logger.info('bot_shutdown', {});
    await bot.stop();
    await closeDb();
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

// Start the bot when run directly (npx tsx bot/src/bot.ts / npm run dev:bot),
// not when imported by tests or other entrypoints.
const isMain = require.main === module;
if (isMain) {
  startBot().catch((err) => {
    logger.error('bot_boot_failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}