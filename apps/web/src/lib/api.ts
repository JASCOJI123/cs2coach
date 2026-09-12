/**
 * Typed REST client (spec §37). All calls carry the Bearer JWT minted by
 * POST /api/auth/telegram. The token is persisted so a Mini App reload and
 * the FACEIT OAuth round-trip do not silently lose authentication.
 */
import type {
  ApiEnvelope,
  AuthResult,
  FaceitStatus,
  MatchLite,
  MatchStateLite,
  TacticalDecisionLite,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const AUTH_STORAGE_KEY = 'cs2coach.session.v1';
let authToken = '';

function loadStoredToken(): string {
  try {
    return window.localStorage.getItem(AUTH_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

authToken = loadStoredToken();

export function setAuthToken(token: string): void {
  authToken = token;
  try {
    if (token) window.localStorage.setItem(AUTH_STORAGE_KEY, token);
    else window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Storage is optional; the in-memory token still works for this session.
  }
}

export function clearAuthToken(): void {
  setAuthToken('');
}

export function hasAuthToken(): boolean {
  return Boolean(authToken || loadStoredToken());
}

export function authTokenOrThrow(): string {
  if (!authToken) authToken = loadStoredToken();
  if (!authToken) throw new ApiError('Not authenticated', 401);
  return authToken;
}

const productionApiUrl = 'https://cs2coach-api.onrender.com';

export const apiUrl = (path: string): string =>
  (import.meta.env.VITE_API_URL || productionApiUrl) + path;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!authToken) authToken = loadStoredToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body != null && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const res = await fetch(apiUrl(path), { ...init, headers, cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body?.ok) {
    if (res.status === 401) clearAuthToken();
    throw new ApiError(body?.message ?? `Request failed (${res.status})`, res.status, body?.error);
  }
  return (body as { data: T }).data;
}

export const api = {
  login: (initData: string) =>
    request<AuthResult>('/api/auth/telegram', { method: 'POST', body: JSON.stringify({ initData }) }),

  exchangeFaceitHandoff: (handoff: string) =>
    request<AuthResult>('/api/auth/faceit/callback-session', {
      method: 'POST',
      body: JSON.stringify({ handoff }),
    }),

  faceitStatus: () => request<FaceitStatus>('/api/auth/faceit/status'),

  connectFaceit: () => request<{ url: string }>('/api/auth/faceit'),

  disconnectFaceit: () => request<{ connected: false }>('/api/auth/faceit/disconnect', { method: 'POST', body: '{}' }),

  listMatches: () => request<MatchLite[]>('/api/matches'),

  getMatch: (faceitMatchId: string) =>
    request<{ id: string; faceitMatchId: string; map: string | null; status: string; score: { a: number; b: number }; live: MatchStateLite | null }>(
      `/api/matches/${encodeURIComponent(faceitMatchId)}`
    ),

  requestCoach: (faceitMatchId: string) =>
    request<TacticalDecisionLite>(`/api/matches/${encodeURIComponent(faceitMatchId)}/coach`, { method: 'POST' }),

  startDemo: () => request<{ matchId: string; demoMode: true }>('/api/demo/start', { method: 'POST' }),
};