/**
 * FACEIT OAuth / FACEIT Connect flow (spec §12).
 * Uses Authorization Code + PKCE for FACEIT OAuth clients configured with PKCE.
 */
import { createHash, randomBytes } from 'node:crypto';
import { AppError, codes } from '@cs2coach/shared';
import type { FaceitTokenResponse } from './types';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Base URL for the data/token API (https://api.faceit.com). */
  authBaseUrl: string;
  /** FACEIT OAuth authorize host (accounts.faceit.com). */
  authorizeBaseUrl: string;
}

export interface OAuthStatePayload {
  telegramKey: string;
  csrf: string;
  exp: number;
}

export interface OAuthStart {
  state: string;
  payload: OAuthStatePayload;
  codeVerifier: string;
  codeChallenge: string;
}

function base64Url(value: Buffer): string {
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Create a state and PKCE verifier/challenge pair for one OAuth flow. */
export function randomOAuthState(ttlMs = 10 * 60_000): OAuthStart {
  const csrf = randomBytes(16).toString('hex');
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  const payload: OAuthStatePayload = {
    telegramKey: '',
    csrf,
    exp: Date.now() + ttlMs,
  };
  return { state: csrf, payload, codeVerifier, codeChallenge };
}

/** Build the start URL for the FACEIT authorization screen. */
export function buildAuthorizeUrl(config: OAuthConfig, state: string, codeChallenge?: string): string {
  // FACEIT publishes these four scopes; offline_access is not supported by the
  // current OpenID configuration and can leave the consent flow in a broken
  // state. Refresh tokens, when issued by FACEIT, are handled server-side.
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: 'openid profile email',
  });
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  return `${config.authorizeBaseUrl}/accounts?${params.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAtMs: number;
}

function basicAuthHeader(config: OAuthConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
}

/** Exchange an authorization code for tokens, including the PKCE verifier. */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  codeVerifier?: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(`${config.authBaseUrl}/auth/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: basicAuthHeader(config),
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    throw new AppError(codes.upstreamError, 'FACEIT token request failed', 502, err instanceof Error ? { cause: err.message } : undefined);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new AppError(res.status === 429 ? codes.rateLimited : codes.upstreamError, `FACEIT OAuth token failed (${res.status})`, res.status || 502, { body: text.slice(0, 200) });
  }

  let json: FaceitTokenResponse;
  try {
    json = JSON.parse(text) as FaceitTokenResponse;
  } catch {
    throw new AppError(codes.upstreamError, 'FACEIT returned invalid token JSON', 502);
  }

  if (!json.access_token) {
    throw new AppError(codes.upstreamError, 'FACEIT returned no access token', 502);
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    expiresAtMs: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

/** Refresh an expiring token set. */
export async function refreshAccessToken(config: OAuthConfig, refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const res = await fetch(`${config.authBaseUrl}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: basicAuthHeader(config),
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new AppError(codes.upstreamError, `FACEIT token refresh failed (${res.status})`, res.status || 502);
  }
  const json = JSON.parse(text) as FaceitTokenResponse;
  if (!json.access_token) {
    throw new AppError(codes.upstreamError, 'FACEIT returned no access token on refresh', 502);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    idToken: json.id_token,
    expiresAtMs: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

export function extractFaceitUserIdFromIdToken(idToken: string): string | null {
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const sub = payload.sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}