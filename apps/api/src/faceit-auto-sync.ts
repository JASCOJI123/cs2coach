import { syncFaceitPlayerHistory, updateFaceitAccountPlayerId } from '@cs2coach/database';
import type { AppConfig } from './config';

const SYNC_INTERVAL_MS = 30_000;

export function startFaceitAutoSync(config: AppConfig): () => void {
  let running = false;

  const sync = async () => {
    if (running || !config.env.databaseUrl || !config.faceitClient.hasApiKey()) return;
    running = true;
    try {
      const accounts = await config.db`
        SELECT user_id, faceit_user_id, nickname, avatar, country, skill_level, elo
        FROM faceit_accounts
        WHERE faceit_user_id IS NOT NULL AND faceit_user_id <> ''
      ` as Array<Record<string, unknown>>;

      for (const account of accounts) {
        try {
          const userId = String(account.userId);
          const currentPlayerId = String(account.faceitUserId);
          const player = await config.faceitClient.resolvePlayer(currentPlayerId, String(account.nickname ?? ''), 'cs2');
          if (player.player_id !== currentPlayerId) {
            await updateFaceitAccountPlayerId(config.db, userId, player.player_id);
          }
          const history = await config.faceitClient.getPlayerMatches(player.player_id, { offset: 0, limit: 20 });
          await syncFaceitPlayerHistory(config.db, {
            faceitPlayerId: player.player_id,
            nickname: player.nickname || String(account.nickname ?? player.player_id),
            avatar: player.avatar ?? (account.avatar as string | null),
            country: player.country ?? (account.country as string | null),
            skillLevel: player.games?.cs2?.skill_level ?? (account.skillLevel as number | null),
            elo: player.games?.cs2?.faceit_elo ?? (account.elo as number | null),
            items: history.items ?? [],
          });
          config.logger.info('faceit_auto_sync_ok', { userId, matchCount: history.items?.length ?? 0 });
        } catch (error) {
          config.logger.warn('faceit_auto_sync_failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      config.logger.warn('faceit_auto_sync_accounts_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  void sync();
  const timer = setInterval(() => void sync(), SYNC_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
