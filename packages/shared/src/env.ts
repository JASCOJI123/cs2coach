/**
 * central environment loader.
 *
 * All secrets live in environment variables. `loadEnv()` reads them once and
 * returns a typed snapshot. Required variables are only enforced in production
 * so local development can start without every integration configured.
 *
 * Cloudflare Workers can pass bindings explicitly through `source` while the
 * normal Node/Render runtime continues to read process.env.
 */
import 'dotenv/config';
import { AppError } from './errors';

export type NodeEnv = 'development' | 'test' | 'production';
export type EnvSource = Record<string, unknown>;

export interface Env {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  isDemoMode: boolean;
  port: number;
  host: string;
  allowedOrigins: string[];
  sessionSecret: string;
  sessionTtlMs: number;
  databaseUrl?: string;
  telegramBotToken?: string;
  telegramWebappUrl?: string;
  telegramWebhookUrl?: string;
  telegramWebhookSecret?: string;
  faceitApiKey?: string;
  faceitClientId?: string;
  faceitClientSecret?: string;
  faceitRedirectUri?: string;
  faceitAuthBaseUrl: string;
  faceitAuthorizeBaseUrl: string;
  faceitDataBaseUrl: string;
  faceitWebhookSecret?: string;
  cs2GsiToken?: string;
  groqApiKey?: string;
  groqModel: string;
  faceitPollIntervalMs: number;
}

function rawValue(name: string, source?: EnvSource): unknown {
  return source?.[name] ?? process.env[name];
}

function readString(name: string, source?: EnvSource): string | undefined {
  const raw = rawValue(name, source);
  if (raw === undefined || raw === null || raw === '') return undefined;
  return String(raw).trim();
}

function readInt(name: string, fallback: number, source?: EnvSource): number {
  const v = readString(name, source);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function readBool(name: string, fallback: boolean, source?: EnvSource): boolean {
  const v = readString(name, source);
  if (v === undefined) return fallback;
  return v.toLowerCase() === 'true' || v === '1';
}

function splitOrigins(v?: string): string[] {
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export function loadEnv(source?: EnvSource): Env {
  const nodeEnvRaw = readString('NODE_ENV', source) ?? 'development';
  const nodeEnv = (['development', 'test', 'production'].includes(nodeEnvRaw) ? nodeEnvRaw : 'development') as NodeEnv;
  const isProduction = nodeEnv === 'production';
  const sessionSecret = readString('SESSION_SECRET', source) || 'dev-insecure-session-secret';
  if (isProduction && (sessionSecret === 'dev-insecure-session-secret' || sessionSecret.includes('change-me'))) {
    throw new AppError('MISSING_ENV', 'SESSION_SECRET must be set to a strong random value in production', 500);
  }

  return {
    nodeEnv,
    isProduction,
    isDemoMode: readBool('DEMO_MODE', false, source) && !isProduction,
    port: readInt('PORT', 8080, source),
    host: readString('HOST', source) || '0.0.0.0',
    allowedOrigins: splitOrigins(readString('ALLOWED_ORIGINS', source)),
    sessionSecret,
    sessionTtlMs: readInt('SESSION_TTL_MS', 7 * 24 * 60 * 60 * 1000, source),
    databaseUrl: readString('DATABASE_URL', source),
    telegramBotToken: readString('TELEGRAM_BOT_TOKEN', source),
    telegramWebappUrl: readString('TELEGRAM_WEBAPP_URL', source),
    telegramWebhookUrl: readString('TELEGRAM_WEBHOOK_URL', source),
    telegramWebhookSecret: readString('TELEGRAM_WEBHOOK_SECRET', source),
    faceitApiKey: readString('FACEIT_API_KEY', source),
    faceitClientId: readString('FACEIT_CLIENT_ID', source),
    faceitClientSecret: readString('FACEIT_CLIENT_SECRET', source),
    faceitRedirectUri: readString('FACEIT_REDIRECT_URI', source),
    faceitAuthBaseUrl: readString('FACEIT_AUTH_BASE_URL', source) ?? 'https://api.faceit.com',
    faceitAuthorizeBaseUrl: readString('FACEIT_AUTHORIZE_BASE_URL', source) ?? 'https://accounts.faceit.com',
    faceitDataBaseUrl: readString('FACEIT_DATA_BASE_URL', source) ?? 'https://open.faceit.com/data/v4',
    faceitWebhookSecret: readString('FACEIT_WEBHOOK_SECRET', source),
    cs2GsiToken: readString('CS2_GSI_TOKEN', source),
    groqApiKey: readString('GROQ_API_KEY', source),
    groqModel: readString('GROQ_MODEL', source) ?? 'openai/gpt-oss-120b',
    faceitPollIntervalMs: readInt('FACEIT_POLL_INTERVAL_MS', 45_000, source),
  };
}

export type EnvKey = keyof Env;

export function requireSecret(env: Env, key: NonNullable<EnvKey>, display: string): string {
  const value = env[key];
  if (typeof value === 'string' && value.length > 0 && value !== 'dev-insecure-session-secret') return value;
  throw new AppError('MISSING_ENV', `Missing required environment variable: ${display}`, 500);
}
