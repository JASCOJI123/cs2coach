/**
 * FACEIT OAuth routes (spec §12): start the authorize redirect, handle the
 * callback (validate state + exchange code), expose connection status.
 * Tokens are AES-256-GCM encrypted at rest with `serializeEncrypted`.
 *
 * The OAuth `state` binds the (already JWT-authenticated) user to the pending
 * flow in a server-side TTL map, because the callback arrives as a browser
 * redirect without a Bearer header.
 */
import type { FastifyInstance } from 'fastify';
import { AppError, codes, encryptSecret, serializeEncrypted } from '@cs2coach/shared';
import {
  findFaceitAccountByFaceitUserId,
  findFaceitAccountByUserId,
  upsertFaceitAccountByUser,
  deleteFaceitAccount,
} from '@cs2coach/database';
import type { AppConfig } from '../config';
import { requireAuth } from '../middleware/telegram-auth';

interface PendingOAuth {
  userId: string;
  exp: number;
}

const PENDING_TTL_MS = 10 * 60_000;
// In-memory (per-dyno) state store — acceptable for this free-tier app since
// the flow is short-lived; a multi-dyno deployment should use the database.
const pendingStates = new Map<string, PendingOAuth>();

export async function faceitAuthRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  // GET /api/auth/faceit — start OAuth, return the authorize URL
  app.get('/api/auth/faceit', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    if (!config.env.faceitClientId || !config.env.faceitClientSecret) {
      throw new AppError(codes.missingEnv, 'FACEIT OAuth is not configured on the server', 503);
    }

    const { state } = config.faceitOAuth.randomOAuthState(PENDING_TTL_MS);
    pendingStates.set(state, { userId: user.userId, exp: Date.now() + PENDING_TTL_MS });
    const url = config.faceitOAuth.buildAuthorizeUrl(config.faceitOAuth.oauthConfig, state);
    return reply.send({ ok: true, data: { url } });
  });

  // GET /api/auth/faceit/callback?code=&state=
  app.get('/api/auth/faceit/callback', async (request, reply) => {
    const q = request.query as { state?: string; code?: string };
    if (!q.code || !q.state) {
      throw new AppError(codes.badRequest, 'code and state are required', 400);
    }
    if (!config.env.faceitClientId || !config.env.faceitClientSecret) {
      throw new AppError(codes.missingEnv, 'FACEIT OAuth is not configured on the server', 503);
    }

    const pending = pendingStates.get(q.state);
    if (!pending || pending.exp < Date.now()) {
      pendingStates.delete(q.state);
      throw new AppError(codes.forbidden, 'Invalid or expired OAuth state', 400);
    }
    pendingStates.delete(q.state);

    const tokens = await config.faceitOAuth.exchangeCodeForToken(q.code);
    const faceitUserId = config.faceitOAuth.extractFaceitUserIdFromIdToken(tokens.idToken ?? '');
    if (!faceitUserId) {
      throw new AppError(codes.upstreamError, 'FACEIT did not return a user id_token', 400);
    }
    if (!tokens.refreshToken) {
      throw new AppError(codes.upstreamError, 'FACEIT did not return a refresh token', 400);
    }

    // Enrich the profile so we store a real nickname, not a placeholder.
    let nickname = '';
    try {
      const profile = await config.faceitClient.getPlayerById(faceitUserId);
      nickname = profile.nickname ?? '';
    } catch {
      nickname = '';
    }

    const account = await findFaceitAccountByFaceitUserId(config.db, faceitUserId);
    const accessTokenEnc = serializeEncrypted(encryptSecret(config.env.sessionSecret, tokens.accessToken));
    const refreshTokenEnc = serializeEncrypted(encryptSecret(config.env.sessionSecret, tokens.refreshToken));

    // If another user already bound this FACEIT account, rebind to the current one.
    const existing = (await findFaceitAccountByUserId(config.db, pending.userId)) ??
      (account ?? null);

    await upsertFaceitAccountByUser(config.db, {
      userId: existing?.userId ?? pending.userId,
      faceitUserId,
      nickname: nickname || (existing?.nickname ?? ''),
      accessToken: accessTokenEnc,
      refreshToken: refreshTokenEnc,
      expiresAtMs: tokens.expiresAtMs,
    });

    return reply.redirect(`${config.env.telegramWebappUrl ?? 'http://localhost:5173'}/#/faceit-callback?ok=1`);
  });

  // GET /api/auth/faceit/status
  app.get('/api/auth/faceit/status', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    return reply.send({
      ok: true,
      data: account ? { connected: true, nickname: account.nickname, faceitUserId: account.faceitUserId } : { connected: false },
    });
  });

  // DELETE /api/auth/faceit — disconnect
  app.delete('/api/auth/faceit', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    await deleteFaceitAccount(config.db, user.userId);
    return reply.send({ ok: true, data: { connected: false } });
  });
}