/**
 * FACEIT OAuth routes (spec §12): start the authorize redirect, handle the
 * callback (validate state + exchange code), expose connection status.
 * Tokens are AES-256-GCM encrypted at rest with `serializeEncrypted`.
 *
 * OAuth state binds the already JWT-authenticated user to the pending flow.
 * PKCE verifier is kept server-side and is never sent to the browser.
 */
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
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
  codeVerifier: string;
}

interface PendingHandoff {
  userId: string;
  exp: number;
}

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
  // GET /api/auth/faceit — start OAuth, return the authorize URL
  app.get('/api/auth/faceit', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    if (!config.env.faceitClientId || !config.env.faceitClientSecret) {
      throw new AppError(codes.missingEnv, 'FACEIT OAuth is not configured on the server', 503);
    }

    const { state, codeVerifier, codeChallenge } = config.faceitOAuth.randomOAuthState(PENDING_TTL_MS);
    pendingStates.set(state, { userId: user.userId, exp: Date.now() + PENDING_TTL_MS, codeVerifier });
    const url = config.faceitOAuth.buildAuthorizeUrl(config.faceitOAuth.oauthConfig, state, codeChallenge);
    return reply.send({ ok: true, data: { url } });
  });

  // GET /api/auth/faceit/callback?code=&state=
  app.get('/api/auth/faceit/callback', async (request, reply) => {
    const q = request.query as { state?: string; code?: string; error?: string; error_description?: string };
    if (q.error) {
      throw new AppError(codes.upstreamError, `FACEIT authorization failed: ${q.error_description ?? q.error}`, 400);
    }
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

    const tokens = await config.faceitOAuth.exchangeCodeForToken(q.code, pending.codeVerifier);
    const faceitUserId = config.faceitOAuth.extractFaceitUserIdFromIdToken(tokens.idToken ?? '');
    if (!faceitUserId) {
      throw new AppError(codes.upstreamError, 'FACEIT did not return a user id_token', 400);
    }
    if (!tokens.refreshToken) {
      throw new AppError(codes.upstreamError, 'FACEIT did not return a refresh token', 400);
    }

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

    const existing = (await findFaceitAccountByUserId(config.db, pending.userId)) ?? (account ?? null);

    await upsertFaceitAccountByUser(config.db, {
      userId: existing?.userId ?? pending.userId,
      faceitUserId,
      nickname: nickname || (existing?.nickname ?? ''),
      accessToken: accessTokenEnc,
      refreshToken: refreshTokenEnc,
      expiresAtMs: tokens.expiresAtMs,
    });

    const handoff = createHandoff(pending.userId);
    const webappUrl = config.env.telegramWebappUrl ?? 'http://localhost:5173';
    return reply.redirect(`${webappUrl}#/faceit-callback?handoff=${encodeURIComponent(handoff)}`);
  });

  // Exchange the one-time browser handoff for a normal API session. This route
  // is intentionally unauthenticated because the handoff itself is a random,
  // single-use, five-minute capability created only after a successful FACEIT
  // OAuth callback. The returned session is the same JWT used everywhere else.
  app.post('/api/auth/faceit/callback-session', async (request, reply) => {
    const body = request.body as { handoff?: string } | undefined;
    const handoff = body?.handoff;
    if (!handoff || !/^[a-f0-9]{64}$/.test(handoff)) {
      throw new AppError(codes.badRequest, 'handoff is required', 400);
    }

    const pending = pendingHandoffs.get(handoff);
    pendingHandoffs.delete(handoff);
    if (!pending || pending.exp < Date.now()) {
      throw new AppError(codes.forbidden, 'Invalid or expired FACEIT handoff', 400);
    }

    const token = config.signSession({
      sub: pending.userId,
      telegramId: 0,
    });

    return reply.send({
      ok: true,
      data: {
        token,
        expiresAt: Date.now() + config.env.sessionTtlMs,
        user: { id: pending.userId, firstName: '', username: '' },
        demoMode: config.env.isDemoMode,
      },
    });
  });

  app.get('/api/auth/faceit/status', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    const account = await findFaceitAccountByUserId(config.db, user.userId);
    return reply.send({
      ok: true,
      data: account ? { connected: true, nickname: account.nickname, faceitUserId: account.faceitUserId } : { connected: false },
    });
  });

  app.delete('/api/auth/faceit', { preHandler: await requireAuth(config) }, async (request, reply) => {
    const user = request.authedUser!;
    await deleteFaceitAccount(config.db, user.userId);
    return reply.send({ ok: true, data: { connected: false } });
  });
}