import type { FastifyInstance } from 'fastify';
import { findFaceitAccountByUserId } from '@cs2coach/database';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

/** Re-syncs the connected FACEIT profile so level/ELO do not depend on stale OAuth data. */
export async function faceitProfileRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post('/api/auth/faceit/refresh-profile', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    if (!account) return reply.status(404).send({ ok: false, error: { code: 'FACEIT_NOT_CONNECTED', message: 'FACEIT akkaunt ulanmagan' } });

    try {
      // Bypass the normal 60s GET cache: this endpoint is explicitly a manual/
      // post-match refresh and must read the current FACEIT Elo.
      let profile;
      try {
        profile = await config.faceitClient.getPlayerById(account.faceitUserId, { ttlMs: 0 });
      } catch {
        profile = await config.faceitClient.resolvePlayer(account.faceitUserId, account.nickname, 'cs2');
      }
      const cs2 = profile.games?.cs2;
      const skillLevel = cs2?.skill_level ?? null;
      const elo = cs2?.faceit_elo ?? null;
      await config.db`
        update faceit_accounts
        set faceit_user_id = ${profile.player_id || account.faceitUserId},
            nickname = ${profile.nickname || account.nickname},
            avatar = ${profile.avatar ?? account.avatar},
            country = ${profile.country ?? account.country},
            skill_level = ${skillLevel},
            elo = ${elo},
            updated_at = now()
        where user_id = ${user.userId}
      `;
      config.logger.info('faceit_profile_refreshed', { userId: user.userId, skillLevel, elo, hasCs2Game: Boolean(cs2) });
      return reply.send({ ok: true, data: { connected: true, nickname: profile.nickname, faceitUserId: profile.player_id, avatar: profile.avatar ?? null, country: profile.country ?? null, skillLevel, elo } });
    } catch (error) {
      config.logger.warn('faceit_profile_refresh_failed', { userId: user.userId, error: error instanceof Error ? error.message : String(error) });
      return reply.status(502).send({ ok: false, error: { code: 'FACEIT_PROFILE_REFRESH_FAILED', message: 'FACEIT profilini yangilab bo‘lmadi' } });
    }
  });
}
