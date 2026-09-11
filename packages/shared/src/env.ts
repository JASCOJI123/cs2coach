/**
 * central environment loader.
 *
 * All secrets live in environment variables. `loadEnv()` reads them once and
 * returns a typed snapshot. Required variables are only enforced in production
 * so local development can start without every integration configured.
 */
import 'dotenv/config';
import { AppError } from './errors';

export type NodeEnv = 'development' | 'test' | 'production';

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
  faceitDataBaseUrl: string;
  faceitWebhookSecret?: string;

  groqApiKey?: string;
  groqModel: string;

  faceitPollIntervalMs: number;
}

function readString(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v.trim();
}

function readInt(name: string, fallback: number): number {
  const v = readString(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
  const v = readString(name);
  if (v === undefined) return fallback;
  return v.toLowerCase() === 'true' || v === '1';
}

function splitOrigins(v?: string): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadEnv(): Env {
  const nodeEnvRaw = process.env.NODE_ENV ?? process.env.NODE_ENV ?? 'development';
  const nodeEnv = (['development', 'test', 'production'].includes(nodeEnvRaw)
    ? nodeEnvRaw
    : 'development') as NodeEnv;

  const isProduction = nodeEnv === 'production';
  const sessionSecret = process.env.SESSION_SECRET?.trim() || 'dev-insecure-session-secret';

  if (isProduction && (sessionSecret === 'dev-insecure-session-secret' || sessionSecret.includes('change-me'))) {
    throw new AppError('MISSING_ENV', 'SESSION_SECRET must be set to a strong random value in production', 500);
  }

  return {
    nodeEnv,
    isProduction,
    isDemoMode: readBool('DEMO_MODE', false) && !isProduction,
    port: readInt('PORT', 8080),
    host: process.env.HOST?.trim() || '0.0.0.0',
    allowedOrigins: splitOrigins(process.env.ALLOWED_ORIGINS),
    sessionSecret,
    sessionTtlMs: readInt('SESSION_TTL_MS', 7 * 24 * 60 * 60 * 1000),

    databaseUrl: readString('DATABASE_URL'),
    telegramBotToken: readString('TELEGRAM_BOT_TOKEN'),
    telegramWebappUrl: readString('TELEGRAM_WEBAPP_URL'),
    telegramWebhookUrl: readString('TELEGRAM_WEBHOOK_URL'),
    telegramWebhookSecret: readString('TELEGRAM_WEBHOOK_SECRET'),

    faceitApiKey: readString('FACEIT_API_KEY'),
    faceitClientId: readString('FACEIT_CLIENT_ID'),
    faceitClientSecret: readString('FACEIT_CLIENT_SECRET'),
    faceitRedirectUri: readString('FACEIT_REDIRECT_URI'),
    faceitAuthBaseUrl: readString('FACEIT_AUTH_BASE_URL') ?? 'https://api.faceit.com',
    faceitDataBaseUrl: readString('FACEIT_DATA_BASE_URL') ?? 'https://open.faceit.com/data/v4',
    faceitWebhookSecret: readString('FACEIT_WEBHOOK_SECRET'),

    groqApiKey: readString('GROQ_API_KEY'),
    groqModel: readString('GROQ_MODEL') ?? 'llama-3.3-70b-versatile',

    faceitPollIntervalMs: readInt('FACEIT_POLL_INTERVAL_MS', 45_000),
  };
}

export type EnvKey = keyof Env;

/** Helper used by prod-only components to guarantee a secret is configured. */
export function requireSecret(env: Env, key: NonNullable<EnvKey>, display: string): string {
  const value = env[key];
  if (typeof value === 'string' && value.length > 0 && value !== 'dev-insecure-session-secret') {
    return value;
  }
  throw new AppError('MISSING_ENV', `Missing required environment variable: ${display}`, 500);
}