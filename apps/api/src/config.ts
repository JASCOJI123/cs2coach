/**
 * Composition root for the API layer: reads env once, creates all shared
 * singletons (DB, clients, engines, AI queue), and exposes them as `AppConfig`.
 */
import {
  loadEnv, createLogger, signSession, verifySession, type Env, type EnvSource, type Logger, type SessionClaims, type MatchState,
} from '@cs2coach/shared';
import { getDb, pingDb } from '@cs2coach/database';
import {
  FaceitApiClient, buildAuthorizeUrl, exchangeCodeForToken, refreshAccessToken, getUserInfo,
  extractFaceitUserIdFromIdToken, randomOAuthState,
} from '@cs2coach/faceit';
import { AiCoordinator, GroqClient, TacticalAIValidator } from '@cs2coach/ai';
import type { OAuthConfig, OAuthStart, TokenSet, FaceitUserInfo } from '@cs2coach/faceit';
import { MatchStateEngine, OpponentModel, FaceitMatchProvider, CS2GameStateProvider, DemoGameStateProvider } from '@cs2coach/game-state';

export interface AppConfig {
  env: Env;
  logger: Logger;
  db: ReturnType<typeof getDb>;
  pingDb: () => Promise<void>;
  faceitClient: FaceitApiClient;
  faceitOAuth: {
    oauthConfig: OAuthConfig;
    buildAuthorizeUrl: (config: OAuthConfig, state: string, codeChallenge?: string) => string;
    exchangeCodeForToken: (code: string, codeVerifier?: string) => Promise<TokenSet>;
    refreshAccessToken: (refreshToken: string) => Promise<TokenSet>;
    getUserInfo: (accessToken: string) => Promise<FaceitUserInfo>;
    extractFaceitUserIdFromIdToken: (idToken: string) => string | null;
    randomOAuthState: (ttlMs?: number) => OAuthStart;
  };
  opponentModel: OpponentModel;
  matchStateEngine: MatchStateEngine;
  faceitMatchProvider: FaceitMatchProvider;
  cs2GameStateProvider: CS2GameStateProvider;
  demoProvider: DemoGameStateProvider | null;
  groqClient: GroqClient;
  aiValidator: TacticalAIValidator | null;
  aiCoordinator: AiCoordinator;
  broadcastState?: (matchId: string, state: MatchState) => void;
  broadcastDecision?: (matchId: string, decision: unknown) => void;
  signSession: (claims: Omit<SessionClaims, 'iat' | 'exp'>) => string;
  verifySession: (token: string) => SessionClaims | null;
}

export interface AppConfigOptions {
  singleton?: boolean;
  requestScopedDb?: boolean;
}

let singleton: AppConfig | null = null;

function canonicalFaceitRedirectUri(configured?: string, webappUrl?: string): string {
  const fallback = `${webappUrl ?? 'http://localhost:5173'}/faceit/callback`;
  const value = configured?.trim() || fallback;
  return value.replace('cs2-coach-api.onrender.com', 'cs2coach-api.onrender.com');
}

export function createAppConfig(source?: EnvSource, options: AppConfigOptions = {}): AppConfig {
  const useSingleton = options.singleton !== false;
  if (useSingleton && singleton) return singleton;

  const env = loadEnv(source);
  const logger = createLogger('api');
  const dbUrl = env.databaseUrl;
  if (!dbUrl) logger.warn('no_database_url', { msg: 'DATABASE_URL not set — DB calls will fail' });
  const db = getDb(dbUrl ?? 'postgresql://localhost:5432/cs2coach', { reuse: options.requestScopedDb === true ? false : true });
  const ping = async () => {
    try { await pingDb(db); }
    catch (err) { logger.warn('db_ping_failed', { error: (err as Error).message }); throw err; }
  };

  const faceitClient = new FaceitApiClient({ apiKey: env.faceitApiKey ?? '', baseUrl: env.faceitDataBaseUrl, logger });
  const oauthConfig: OAuthConfig = {
    clientId: env.faceitClientId ?? '', clientSecret: env.faceitClientSecret ?? '',
    redirectUri: canonicalFaceitRedirectUri(env.faceitRedirectUri, env.telegramWebappUrl),
    authBaseUrl: env.faceitAuthBaseUrl, authorizeBaseUrl: env.faceitAuthorizeBaseUrl,
  };
  const faceitOAuth = {
    oauthConfig, buildAuthorizeUrl,
    exchangeCodeForToken: (code: string, codeVerifier?: string) => exchangeCodeForToken(oauthConfig, code, codeVerifier),
    refreshAccessToken: (refreshToken: string) => refreshAccessToken(oauthConfig, refreshToken),
    getUserInfo: (accessToken: string) => getUserInfo(oauthConfig, accessToken),
    extractFaceitUserIdFromIdToken, randomOAuthState,
  };
  const opponentModel = new OpponentModel();
  const matchStateEngine = new MatchStateEngine({
    learn: (state, event) => opponentModel.learn(state, event),
    onStateChange: (matchId, state) => logger.debug('state_bumped', { matchId, version: state.stateVersion, hash: state.stateHash }),
  });
  const faceitMatchProvider = new FaceitMatchProvider(faceitClient, logger);
  const cs2GameStateProvider = new CS2GameStateProvider(logger);
  let demoProvider: DemoGameStateProvider | null = null;
  if (env.isDemoMode) {
    try { demoProvider = new DemoGameStateProvider({ isDemoMode: true, matchId: `demo-${Date.now()}` }, logger); } catch { /* safe */ }
  }
  const groqClient = new GroqClient({ apiKey: env.groqApiKey ?? '', model: env.groqModel }, logger);
  const aiValidator = groqClient.available ? new TacticalAIValidator(groqClient, logger) : null;
  const aiCoordinator = new AiCoordinator({ cooldownMs: env.groqApiKey ? 12_000 : 0 }, logger);
  if (aiValidator) {
    aiCoordinator.setValidator(async (_matchId, state, userTeamId) => {
      try { return await aiValidator.requestTactical({ state, userTeamId }); } catch { return null; }
    });
  }
  const sessionSign = (claims: Omit<SessionClaims, 'iat' | 'exp'>) => {
    const now = Date.now();
    return signSession(env.sessionSecret, { ...claims, iat: now, exp: now + env.sessionTtlMs });
  };
  const sessionVerify = (token: string) => verifySession(env.sessionSecret, token);
  const result: AppConfig = {
    env, logger, db, pingDb: ping, faceitClient, faceitOAuth, opponentModel, matchStateEngine,
    faceitMatchProvider, cs2GameStateProvider, demoProvider, groqClient, aiValidator, aiCoordinator,
    broadcastState: undefined, broadcastDecision: undefined, signSession: sessionSign, verifySession: sessionVerify,
  };
  if (useSingleton) singleton = result;
  return result;
}
