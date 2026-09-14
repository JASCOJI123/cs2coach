/** Fastify API server composition root. */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { AppError,isAppError,toErrorBody,createLogger } from '@cs2coach/shared';
import { runMigrations } from '@cs2coach/database';
import { createAppConfig,type AppConfig } from './config';
import { startFaceitAutoSync } from './faceit-auto-sync';
import { WebSocketManager } from './ws/websocket-manager';
import { healthRoutes } from './routes/health'; import { matchesRoutes } from './routes/matches'; import { matchAnalysisRoutes } from './routes/match-analysis'; import { matchStatsRoutes } from './routes/match-stats';
import { telegramAuthRoutes } from './routes/auth-telegram'; import { faceitAuthRoutes } from './routes/auth-faceit'; import { faceitProfileRoutes } from './routes/faceit-profile'; import { gameStateRoutes } from './routes/game-state'; import { gameStateGsiRoutes } from './routes/game-state-gsi'; import { faceitWebhookRoutes } from './routes/webhooks-faceit'; import { subscriptionRoutes } from './routes/subscription'; import { demoRoutes } from './routes/demo'; import { wsRoutes } from './routes/ws';

export interface BuildServerOptions {
  /** Cloudflare Workers cannot use HTTP upgrade events, so disable the Fastify websocket plugin there. */
  enableWebsocket?: boolean;
  /** Node uses the interval-based sync; Workers use a Cron Trigger instead. */
  enableAutoSync?: boolean;
  /** Workers do not expose a process lifecycle like a long-running Node server. */
  enableProcessSignals?: boolean;
}

export async function buildServer(config:AppConfig=createAppConfig(), options:BuildServerOptions={}):Promise<FastifyInstance>{
  const logger=config.logger,app=Fastify({logger:false,trustProxy:true}),origins=config.env.allowedOrigins;
  await app.register(cors,{origin(origin,cb){if(!origin||origins.length===0||origins.includes(origin)){cb(null,true);return}cb(new AppError('CORS',`Origin not allowed: ${origin}`,403),false)},credentials:true});
  await app.register(rateLimit,{max:1000,timeWindow:'1 minute'});
  if (options.enableWebsocket !== false) await app.register(websocket);
  app.get('/',async(_request,reply)=>reply.send({ok:true,service:'cs2coach-api',description:'CS2 AI COACH backend — Telegram Mini App API',version:'0.4.0',endpoints:{health:'/health',apiHealth:'/api/health',telegramAuth:'/api/auth/telegram',faceitAuth:'/api/auth/faceit',faceitProfileRefresh:'/api/auth/faceit/refresh-profile',matches:'/api/matches',matchAnalysis:'/api/matches/:faceitMatchId/analysis',matchStats:'/api/matches/:faceitMatchId/stats',subscription:'/api/subscription',faceitWebhook:'/api/webhooks/faceit',gsi:'/api/game-state/gsi',gameState:'/api/game-state',demo:'/api/demo'},dataPolicy:'No fake data — unavailable state is shown as is'}));
  await healthRoutes(app,config); await telegramAuthRoutes(app,config); await faceitAuthRoutes(app,config); await faceitProfileRoutes(app,config); await faceitWebhookRoutes(app,config); await subscriptionRoutes(app,config); await matchesRoutes(app,config); await matchAnalysisRoutes(app,config); await matchStatsRoutes(app,config); await gameStateRoutes(app,config); await gameStateGsiRoutes(app,config); await demoRoutes(app,config);
  if (options.enableWebsocket !== false) {
    const wsManager=new WebSocketManager(logger);
    config.broadcastState=(matchId,state)=>wsManager.broadcastState(matchId,state);
    config.broadcastDecision=(matchId,decision)=>wsManager.broadcastDecision(matchId,decision);
    await wsRoutes(app,config,wsManager);
  }
  app.setErrorHandler((error,request,reply)=>{const status=isAppError(error)?(error.status??500):(typeof(error as{statusCode?:unknown}).statusCode==='number'?Number((error as{statusCode:number}).statusCode):500);const body=toErrorBody(error);logger.warn('request_error',{path:request.url,status,code:body.code,error:error instanceof Error?error.message:String(error)});reply.status(status).send(body)});
  const stopFaceitAutoSync=options.enableAutoSync === false ? () => undefined : startFaceitAutoSync(config);
  if (options.enableProcessSignals !== false) {
    const shutdown=async(signal:string)=>{logger.info('shutdown',{signal});stopFaceitAutoSync();config.faceitMatchProvider.stopAll();config.demoProvider?.stop();await app.close();process.exit(0)};
    process.on('SIGINT',()=>void shutdown('SIGINT')); process.on('SIGTERM',()=>void shutdown('SIGTERM'));
  }
  return app;
}
const isMain=require.main===module;if(isMain){void(async()=>{const config=createAppConfig();if(config.env.databaseUrl)await runMigrations(config.db).then(names=>{if(names.length>0)config.logger.info('migrations_applied',{names})}).catch(err=>config.logger.warn('migrations_failed',{error:(err as Error).message}));const app=await buildServer(config);await app.listen({port:config.env.port,host:config.env.host});config.logger.info('server_listening',{port:config.env.port,host:config.env.host,nodeEnv:config.env.nodeEnv,demoMode:config.env.isDemoMode});await config.pingDb().catch(()=>config.logger.warn('initial_db_ping_failed',{}))})().catch(err=>{const logger=createLogger('api');logger.error('server_boot_failed',{error:err instanceof Error?err.message:String(err)});process.exit(1)})}
