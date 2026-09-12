import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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

function isRetryableDbError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  return ['08000', '08003', '08006', '40001', '40P01', '53300', '57P01'].includes(code);
}

async function disconnectFaceitWithRetry(config: AppConfig, userId: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await deleteFaceitAccount(config.db, userId);
      return;
    } catch (error) {
      lastError = error;
      config.logger.warn('faceit_disconnect_attempt_failed', {
        userId,
        attempt,
        retryable: isRetryableDbError(error),
        error: error instanceof Error ? error.message : String(error),
      });
      if (!isRetryableDbError(error) || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

export async function faceitAuthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get('/api/auth/faceit', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    if (!config.env.faceitClientId) {
      config.logger.error('faceit_oauth_start_missing_client_id', { userId: user.userId });
      return reply.status(503).send({ ok: false, error: { code: codes.missingEnv, message: 'FACEIT_CLIENT_ID is missing on the server' } });
    }
    try {
      const { state, codeVerifier, codeChallenge } = config.faceitOAuth.randomOAuthState(PENDING_TTL_MS);
      pendingStates.set(state, { userId: user.userId, exp: Date.now() + PENDING_TTL_MS, codeVerifier });
      const url = config.faceitOAuth.buildAuthorizeUrl(config.faceitOAuth.oauthConfig, state, codeChallenge);
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('Generated FACEIT authorization URL is invalid');
      config.logger.info('faceit_oauth_started', { userId: user.userId, hasRedirectUri: Boolean(config.faceitOAuth.oauthConfig.redirectUri), authorizeBaseUrl: config.faceitOAuth.oauthConfig.authorizeBaseUrl });
      return reply.send({ ok: true, data: { url } });
    } catch (error) {
      config.logger.error('faceit_oauth_start_failed', { userId: user.userId, error: error instanceof Error ? error.message : String(error) });
      return reply.status(503).send({ ok: false, error: { code: codes.upstreamError, message: 'Unable to start FACEIT authorization' } });
    }
  });

  app.get('/api/auth/faceit/callback', async (request, reply) => {
    const q = request.query as { state?: string; code?: string; error?: string; error_description?: string };
    config.logger.info('faceit_oauth_callback_received', { hasCode: Boolean(q.code), hasState: Boolean(q.state), hasError: Boolean(q.error) });
    if (q.error) throw new AppError(codes.upstreamError, `FACEIT authorization failed: ${q.error_description ?? q.error}`, 400);
    if (!q.code || !q.state) throw new AppError(codes.badRequest, 'code and state are required', 400);
    if (!config.env.faceitClientId || !config.env.faceitClientSecret) throw new AppError(codes.missingEnv, 'FACEIT OAuth is not configured on the server', 503);

    const pending = pendingStates.get(q.state);
    if (!pending || pending.exp < Date.now()) {
      pendingStates.delete(q.state);
      throw new AppError(codes.forbidden, 'Invalid or expired OAuth state', 400);
    }
    pendingStates.delete(q.state);

    const tokens = await config.faceitOAuth.exchangeCodeForToken(q.code, pending.codeVerifier);
    config.logger.info('faceit_oauth_token_received', { hasAccessToken: Boolean(tokens.accessToken), hasRefreshToken: Boolean(tokens.refreshToken), hasIdToken: Boolean(tokens.idToken) });

    let faceitUserId = config.faceitOAuth.extractFaceitUserIdFromIdToken(tokens.idToken ?? '');
    let userInfoNickname = '';
    try {
      const userInfo = await config.faceitOAuth.getUserInfo(tokens.accessToken);
      faceitUserId = userInfo.sub ?? faceitUserId;
      userInfoNickname = userInfo.nickname ?? '';
      config.logger.info('faceit_userinfo_loaded', { hasSub: Boolean(userInfo.sub), hasNickname: Boolean(userInfo.nickname) });
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
      const profile = await config.faceitClient.resolvePlayer(faceitUserId, userInfoNickname, 'cs2');
      nickname = profile.nickname ?? nickname;
      avatar = profile.avatar ?? null;
      country = profile.country ?? null;
      skillLevel = profile.games?.cs2?.skill_level ?? null;
      elo = profile.games?.cs2?.faceit_elo ?? null;
      faceitUserId = profile.player_id || faceitUserId;
      config.logger.info('faceit_profile_loaded', { hasNickname: Boolean(nickname), resolvedPlayerId: Boolean(profile.player_id) });
    } catch (err) {
      config.logger.warn('faceit_profile_load_failed', { error: err instanceof Error ? err.message : String(err) });
    }

    const existing = await findFaceitAccountByUserId(config.db, pending.userId);
    const accessTokenEnc = serializeEncrypted(encryptSecret(config.env.sessionSecret, tokens.accessToken));
    const refreshTokenEnc = tokens.refreshToken ? serializeEncrypted(encryptSecret(config.env.sessionSecret, tokens.refreshToken)) : existing?.refreshToken ?? null;

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
      config.logger.error('faceit_account_save_failed', { userId: pending.userId, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    config.logger.info('faceit_account_saved', { userId: pending.userId });
    const handoff = createHandoff(pending.userId);
    config.logger.info('faceit_oauth_completed', { userId: pending.userId });
    return reply.redirect(`https://t.me/cs2ustozbot?startapp=${encodeURIComponent(handoff)}`);
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
    return reply.send({ ok: true, data: account ? { connected: true, nickname: account.nickname, faceitUserId: account.faceitUserId, avatar: account.avatar, country: account.country, skillLevel: account.skillLevel, elo: account.elo } : { connected: false } });
  });

  const disconnectHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.authedUser!;
    await disconnectFaceitWithRetry(config, user.userId);
    config.logger.info('faceit_account_disconnected', { userId: user.userId });
    return reply.send({ ok: true, data: { connected: false } });
  };

  app.delete('/api/auth/faceit', { preHandler: await requireAuth(config) }, disconnectHandler);
  app.post('/api/auth/faceit/disconnect', { preHandler: await requireAuth(config) }, disconnectHandler);
}
