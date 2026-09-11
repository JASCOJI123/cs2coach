/**
 * Typed REST client (spec §37). All calls carry the Bearer JWT minted by
 * POST /api/auth/telegram. Errors surface as ApiEnvelope failures.
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

let authToken = '';

export function setAuthToken(token: string): void {
  authToken = token;
}

export function authTokenOrThrow(): string {
  if (!authToken) throw new ApiError('Not authenticated', 401);
  return authToken;
}

export const apiUrl = (path: string): string =>
  (import.meta.env.VITE_API_URL ?? '') + path;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string>) };
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const res = await fetch(apiUrl(path), { ...init, headers });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body?.ok) {
    throw new ApiError(body?.message ?? `Request failed (${res.status})`, res.status, body?.error);
  }
  return (body as { data: T }).data;
}

export const api = {
  login: (initData: string) =>
    request<AuthResult>('/api/auth/telegram', { method: 'POST', body: JSON.stringify({ initData }) }),

  faceitStatus: () => request<FaceitStatus>('/api/auth/faceit/status'),

  connectFaceit: () => request<{ url: string }>('/api/auth/faceit'),

  disconnectFaceit: () => request<void>('/api/auth/faceit', { method: 'DELETE' }),

  listMatches: () => request<MatchLite[]>('/api/matches'),

  getMatch: (faceitMatchId: string) =>
    request<{ id: string; faceitMatchId: string; map: string | null; status: string; score: { a: number; b: number }; live: MatchStateLite | null }>(
      `/api/matches/${encodeURIComponent(faceitMatchId)}`
    ),

  requestCoach: (faceitMatchId: string) =>
    request<TacticalDecisionLite>(`/api/matches/${encodeURIComponent(faceitMatchId)}/coach`, { method: 'POST' }),

  startDemo: () => request<{ matchId: string; demoMode: true }>('/api/demo/start', { method: 'POST' }),
};