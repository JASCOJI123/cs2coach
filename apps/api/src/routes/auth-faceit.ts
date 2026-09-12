import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { AppError, codes, encryptSecret, serializeEncrypted } from '@cs2coach/shared';
import {
  findFaceitAccountByUserId,
  relinkFaceitAccount,
  deleteFaceitAccount,
} from '@cs2coach/database';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

interface PendingOAuth { userId: string; exp: number; codeVerifier: string; }
interface PendingHandoff { userId: string; exp: number; }
const PENDING_TTL_MS = 10 * 60_000;
const HANDOFF_TTL_MS = 5 * 60_000;
const pendingStates = new Map<string, PendingOAuth>();
const pendingHandoffs = new Map<string, PendingHandoff>();

function createHandoff(userId: string): string {
  const handoff = randomBytes(32).toString('hex');
  pendingHandoffs.set(handoff, { userId, exp: Date.now() + HANDOFF_TTL_MS });
  return handoff;
}

export async function faceitAuthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/api/auth/faceit', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    if (!config.env.faceitClientId || !config.env.faceitClientSecret) {
      throw new AppError(codes.missingEnv, 'FACEIT OAuth is not configured on the server', 503);
    }
    const { state, codeVerifier, codeChallenge } = config.faceitOAuth.randomOAuthState(PENDING_TTL_MS);
    pendingStates.set(state, { userId: user.userId, exp: Date.now() + PENDING_TTL_MS, codeVerifier });
    const url = config.faceitOAuth.buildAuthorizeUrl(config.faceitOAuth.oauthConfig, state, codeChallenge);
    config.logger.info('faceit_oauth_started', {
      userId: user.userId,
      redirectHost: new URL(config.faceitOAuth.oauthConfig.redirectUri).host,
    });
    return reply.send({ ok: true, data: { url } });
  });

  app.get('/api/auth/faceit/callback', async (request, reply) => {
    const q = request.query as { state?: string; code?: string; error?: string; error_description?: string };
    config.logger.info('faceit_oauth_callback_received', {
      hasCode: Boolean(q.code),
      hasState: Boolean(q.state),
      hasError: Boolean(q.error),
    });
    if (q.error) throw new AppError(codes.upstreamError, `FACEIT authorization failed: ${q.error_description ?? q.error}`, 400);
    if (!q.code || !q.state) throw new AppError(codes.badRequest, 'code and state are required', 400);
    if (!config.env.faceitClientId || !config.env.faceitClientSecret) {
      throw new AppError(codes.missingEnv, 'FACEIT OAuth is not configured on the server', 503);
    }

    const pending = pendingStates.get(q.state);
    if (!pending || pending.exp < Date.now()) {
      pendingStates.delete(q.state);
      throw new AppError(codes.forbidden, 'Invalid or expired OAuth state', 400);
    }
    pendingStates.delete(q.state);

    const tokens = await config.faceitOAuth.exchangeCodeForToken(q.code, pending.codeVerifier);
    config.logger.info('faceit_oauth_token_received', {
      hasAccessToken: Boolean(tokens.accessToken),
      hasRefreshToken: Boolean(tokens.refreshToken),
      hasIdToken: Boolean(tokens.idToken),
    });

    let faceitUserId = config.faceitOAuth.extractFaceitUserIdFromIdToken(tokens.idToken ?? '');
    let userInfoNickname = '';
    try {
      const userInfo = await config.faceitOAuth.getUserInfo(tokens.accessToken);
      faceitUserId = userInfo.sub ?? faceitUserId;
      userInfoNickname = userInfo.nickname ?? '';
      config.logger.info('faceit_userinfo_loaded', {
        hasSub: Boolean(userInfo.sub),
        hasNickname: Boolean(userInfo.nickname),
      });
    } catch (err) {
      config.logger.warn('faceit_userinfo_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    if (!faceitUserId) throw new AppError(codes.upstreamError, 'FACEIT did not return a user id', 400);

    let nickname = userInfoNickname;
    let avatar: string | null = null;
    let country: string | null = null;
    let skillLevel: number | null = null;
    let elo: number | null = null;

    try {
      const profile = nickname
        ? await config.faceitClient.getPlayerByNickname(nickname, 'cs2')
        : await config.faceitClient.getPlayerById(faceitUserId);
      nickname = profile.nickname ?? nickname;
      avatar = profile.avatar ?? null;
      country = profile.country ?? null;
      skillLevel = profile.games?.cs2?.skill_level ?? null;
      elo = profile.games?.cs2?.faceit_elo ?? null;
      faceitUserId = profile.player_id || faceitUserId;
      config.logger.info('faceit_profile_loaded', { hasNickname: Boolean(nickname) });
    } catch (err) {
      config.logger.warn('faceit_profile_load_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const existing = await findFaceitAccountByUserId(config.db, pending.userId);

    const accessTokenEnc = serializeEncrypted(encryptSecret(config.env.sessionSecret, tokens.accessToken));
    const refreshTokenEnc = tokens.refreshToken
      ? serializeEncrypted(encryptSecret(config.env.sessionSecret, tokens.refreshToken))
      : existing?.refreshToken ?? null;

    try {
      await relinkFaceitAccount(config.db, {
        userId: pending.userId,
        faceitUserId,
        nickname: nickname || existing?.nickname || faceitUserId,
        avatar: avatar ?? existing?.avatar ?? null,
        country: country ?? existing?.country ?? null,
        skillLevel: skillLevel ?? existing?.skillLevel ?? null,
        elo: elo ?? existing?.elo ?? null,
        accessToken: accessTokenEnc,
        refreshToken: refreshTokenEnc,
        expiresAtMs: tokens.expiresAtMs,
      });
    } catch (err) {
      config.logger.error('faceit_account_save_failed', {
        userId: pending.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    config.logger.info('faceit_account_saved', { userId: pending.userId });

    const handoff = createHandoff(pending.userId);
    const webappUrl = config.env.telegramWebappUrl ?? 'http://localhost:5173';
    config.logger.info('faceit_oauth_completed', { userId: pending.userId });
    return reply.redirect(`${webappUrl}#/faceit-callback?handoff=${encodeURIComponent(handoff)}`);
  });

  app.post('/api/auth/faceit/callback-session', async (request, reply) => {
    const body = request.body as { handoff?: string } | undefined;
    const handoff = body?.handoff;
    if (!handoff || !/^[a-f0-9]{64}$/.test(handoff)) throw new AppError(codes.badRequest, 'handoff is required', 400);
    const pending = pendingHandoffs.get(handoff);
    pendingHandoffs.delete(handoff);
    if (!pending || pending.exp < Date.now()) throw new AppError(codes.forbidden, 'Invalid or expired FACEIT handoff', 400);
    const token = config.signSession({ sub: pending.userId, telegramId: 0 });
    return reply.send({ ok: true, data: { token, expiresAt: Date.now() + config.env.sessionTtlMs, user: { id: pending.userId, firstName: '', username: '' }, demoMode: config.env.isDemoMode } });
  });

  app.get('/api/auth/faceit/status', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    return reply.send({
      ok: true,
      data: account
        ? { connected: true, nickname: account.nickname, faceitUserId: account.faceitUserId, avatar: account.avatar, country: account.country, skillLevel: account.skillLevel, elo: account.elo }
        : { connected: false },
    });
  });

  app.delete('/api/auth/faceit', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    await deleteFaceitAccount(config.db, user.userId);
    return reply.send({ ok: true, data: { connected: false } });
  });
}
