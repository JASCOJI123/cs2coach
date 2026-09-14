import { handleAsNodeRequest } from 'cloudflare:node';
import { buildServer, type BuildServerOptions } from '../../api/src/server';
import { createAppConfig, type AppConfig } from '../../api/src/config';
import { syncFaceitAccountsOnce } from '../../api/src/faceit-auto-sync';
import { configureTelegramWebhook, handleTelegramWebhook } from './telegram';

type HyperdriveBinding = { connectionString: string };

type WorkerEnv = Record<string, unknown> & {
  HYPERDRIVE: HyperdriveBinding;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_WEBHOOK_URL?: string;
  TELEGRAM_WEBAPP_URL?: string;
};

const PORT = 8787;

function toAppEnv(env: WorkerEnv): Record<string, unknown> {
  const source: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') source[key] = value;
  }
  source.NODE_ENV = 'production';
  source.HOST = '0.0.0.0';
  source.PORT = String(PORT);
  source.DATABASE_URL = env.HYPERDRIVE.connectionString;
  return source;
}

let serverPromise: Promise<unknown> | undefined;
let appConfig: AppConfig | undefined;

async function ensureServer(env: WorkerEnv): Promise<void> {
  if (serverPromise) {
    await serverPromise;
    return;
  }

  serverPromise = (async () => {
    appConfig = createAppConfig(toAppEnv(env));
    const options: BuildServerOptions = {
      enableWebsocket: false,
      enableAutoSync: false,
      enableProcessSignals: false,
      enableMiddlewarePlugins: false,
    };
    const app = await buildServer(appConfig, options);
    await app.listen({ port: PORT, host: '0.0.0.0' });
  })();

  try {
    await serverPromise;
  } catch (error) {
    serverPromise = undefined;
    console.error('worker_server_startup_failed', error);
    throw error;
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/telegram/webhook') {
        await ensureServer(env);
        return handleTelegramWebhook(request, env, appConfig!);
      }
      await ensureServer(env);
      return handleAsNodeRequest(PORT, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('worker_request_failed', error);
      return new Response(JSON.stringify({ ok: false, error: message }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    const config = appConfig ?? createAppConfig(toAppEnv(env));
    appConfig = config;
    await syncFaceitAccountsOnce(config);
    await configureTelegramWebhook(env, config);
  },
};
