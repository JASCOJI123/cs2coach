/**
 * FACEIT OAuth / FACEIT Connect flow (spec §12).
 * Never requests a FACEIT password — only the authorization-code grant with a
 * secure random `state` value validated by the backend.
 */
import { randomBytes } from 'node:crypto';
import { AppError, codes } from '@cs2coach/shared';
import type { FaceitTokenResponse } from './types';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBaseUrl: string;
}

export interface OAuthStatePayload {
  telegramKey: string; // opaque session/state marker, not telegram id directly if contestable
  csrf: string;
  exp: number;
}

export function randomOAuthState(ttlMs = 10 * 60_000): { state: string; payload: OAuthStatePayload } {
  const csrf = randomBytes(16).toString('hex');
  const payload: OAuthStatePayload = {
    telegramKey: '',
    csrf,
    exp: Date.now() + ttlMs,
  };
  return { state: csrf, payload };
}

/** Build the start URL for the FACEIT authorization screen. */
export function buildAuthorizeUrl(config: OAuthConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: 'openid',
  });
  return `${config.authBaseUrl}/auth/v1/oauth/authorize?${params.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAtMs: number;
}

/** Exchange an authorization code for tokens at the FACEIT token endpoint. */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(`${config.authBaseUrl}/auth/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const res = await fetch(`${config.authBaseUrl}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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

/**
 * Extract the FACEIT user id from the OpenID `id_token` payload (JWT) without
 * verifying the signature here — the token was just issued by FACEIT over TLS.
 */
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