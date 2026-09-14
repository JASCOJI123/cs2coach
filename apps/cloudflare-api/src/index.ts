import { handleAsNodeRequest } from 'cloudflare:node';
import { buildServer, type BuildServerOptions } from '../../api/src/server';
import { createAppConfig, type AppConfig } from '../../api/src/config';
import { syncFaceitAccountsOnce } from '../../api/src/faceit-auto-sync';

type HyperdriveBinding = { connectionString: string };

type WorkerEnv = Record<string, unknown> & {
  HYPERDRIVE: HyperdriveBinding;
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
    };
    const app = await buildServer(appConfig, options);
    // Cloudflare's node:http server uses this port as an internal routing key.
    await app.listen({ port: PORT, host: '0.0.0.0' });
  })();

  await serverPromise;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    await ensureServer(env);
    return handleAsNodeRequest(PORT, request);
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    const config = appConfig ?? createAppConfig(toAppEnv(env));
    appConfig = config;
    await syncFaceitAccountsOnce(config);
  },
};
