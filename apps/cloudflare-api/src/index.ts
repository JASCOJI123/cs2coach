import { createAppConfig, type AppConfig } from '../../api/src/config';
import { getDb } from '@cs2coach/database';
import { syncFaceitAccountsOnce } from '../../api/src/faceit-auto-sync';
import { configureTelegramWebhook, handleTelegramWebhook } from './telegram';
import { createWorkerRouter, handleWorkerRequest, type WorkerRouter } from './worker-router';

type HyperdriveBinding = { connectionString: string };

type WorkerEnv = Record<string, unknown> & {
  HYPERDRIVE: HyperdriveBinding;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_WEBHOOK_URL?: string;
  TELEGRAM_WEBAPP_URL?: string;
};

function toAppEnv(env: WorkerEnv): Record<string, unknown> {
  const source: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') source[key] = value;
  }
  source.NODE_ENV = 'production';
  source.HOST = '0.0.0.0';
  source.PORT = '8787';
  source.DATABASE_URL = env.HYPERDRIVE.connectionString;
  return source;
}

let appConfig: AppConfig | undefined;
let workerRouter: WorkerRouter | undefined;

async function ensureRuntime(env: WorkerEnv): Promise<{ config: AppConfig; router: WorkerRouter }> {
  if (!appConfig) {
    appConfig = createAppConfig(toAppEnv(env), { singleton: false, requestScopedDb: true });
    workerRouter = await createWorkerRouter(appConfig);
  } else {
    // Hyperdrive clients are request-scoped in Workers. Rebind the shared
    // service graph to a fresh client while retaining in-memory match/AI state.
    appConfig.db = getDb(env.HYPERDRIVE.connectionString, { reuse: false });
    appConfig.pingDb = async () => {
      const [{ ok }] = await appConfig!.db`select true as ok`;
      if (ok !== true) throw new Error('database ping failed');
    };
  }
  return { config: appConfig, router: workerRouter! };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    try {
      const { config, router } = await ensureRuntime(env);
      const pathname = new URL(request.url).pathname;
      if (pathname === '/telegram/webhook') return handleTelegramWebhook(request, env, config);
      return await handleWorkerRequest(request, router, config);
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
    const config = createAppConfig(toAppEnv(env), { singleton: false, requestScopedDb: true });
    await syncFaceitAccountsOnce(config);
    await configureTelegramWebhook(env, config);
  },
};
