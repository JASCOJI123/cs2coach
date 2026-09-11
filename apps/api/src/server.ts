/**
 * Fastify API server (spec §37–§41). Composes the single `AppConfig`, enables
 * CORS + rate limiting + WebSockets, registers all routes, and listens.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';

import { AppError, isAppError, toErrorBody, createLogger } from '@cs2coach/shared';
import { createAppConfig, type AppConfig } from './config';
import { WebSocketManager } from './ws/websocket-manager';
import { healthRoutes } from './routes/health';
import { matchesRoutes } from './routes/matches';
import { telegramAuthRoutes } from './routes/auth-telegram';
import { faceitAuthRoutes } from './routes/auth-faceit';
import { gameStateRoutes } from './routes/game-state';
import { demoRoutes } from './routes/demo';
import { wsRoutes } from './routes/ws';

export async function buildServer(config: AppConfig = createAppConfig()): Promise<FastifyInstance> {
  const logger = config.logger;
  const app = Fastify({ logger: false, trustProxy: true });

  // ── CORS (spec §41) ─────────────────────────────────────────────────────────
  const origins = config.env.allowedOrigins;
  await app.register(cors, {
    origin(origin, cb) {
      if (!origin || origins.length === 0 || origins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new AppError('CORS', `Origin not allowed: ${origin}`, 403), false);
    },
    credentials: true,
  });

  // ── Rate limiting (spec §44) ────────────────────────────────────────────────
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  // ── WebSockets (spec §32) ──────────────────────────────────────────────────
  await app.register(websocket);

  // ── Routes ──────────────────────────────────────────────────────────────────
  // Root route: friendly service info so / is not a bare 404 in a browser.
  app.get('/', async (_request, reply) => {
    return reply.send({
      ok: true,
      service: 'cs2coach-api',
      description: 'CS2 AI COACH backend — Telegram Mini App API',
      version: '0.1.0',
      endpoints: {
        health: '/health',
        apiHealth: '/api/health',
        telegramAuth: '/api/auth/telegram',
        faceitAuth: '/api/auth/faceit',
        matches: '/api/matches',
        gameState: '/api/game-state',
        demo: '/api/demo',
      },
      dataPolicy: 'No fake data — unavailable state is shown as is (spec §12)',
    });
  });
  await healthRoutes(app, config);
  await telegramAuthRoutes(app, config);
  await faceitAuthRoutes(app, config);
  await matchesRoutes(app, config);
  await gameStateRoutes(app, config);
  await demoRoutes(app, config);

  const wsManager = new WebSocketManager(logger);
  await wsRoutes(app, config, wsManager);

  // ── Error handling (spec §38) ───────────────────────────────────────────────
  app.setErrorHandler((error, request, reply) => {
    const status = isAppError(error) ? (error.status ?? 500) : 500;
    const body = toErrorBody(error);
    logger.warn('request_error', { path: request.url, status, code: body.code });
    reply.status(status).send(body);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info('shutdown', { signal });
    config.faceitMatchProvider.stopAll();
    config.demoProvider?.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  return app;
}

// Start server when run directly (not imported)
const isMain = require.main === module;
if (isMain) {
  void (async () => {
    const config = createAppConfig();
    const app = await buildServer(config);
    await app.listen({ port: config.env.port, host: config.env.host });
    config.logger.info('server_listening', {
      port: config.env.port,
      host: config.env.host,
      nodeEnv: config.env.nodeEnv,
      demoMode: config.env.isDemoMode,
    });
    // Startup DB ping so failures surface early
    await config.pingDb().catch(() => config.logger.warn('initial_db_ping_failed', {}));
  })().catch((err) => {
    const logger = createLogger('api');
    logger.error('server_boot_failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}