import { isAppError, toErrorBody } from '@cs2coach/shared';
import type { AppConfig } from '../../api/src/config';
import { healthRoutes } from '../../api/src/routes/health';
import { telegramAuthRoutes } from '../../api/src/routes/auth-telegram';
import { faceitAuthRoutes } from '../../api/src/routes/auth-faceit';
import { faceitProfileRoutes } from '../../api/src/routes/faceit-profile';
import { faceitWebhookRoutes } from '../../api/src/routes/webhooks-faceit';
import { subscriptionRoutes } from '../../api/src/routes/subscription';
import { matchesRoutes } from '../../api/src/routes/matches';
import { matchAnalysisRoutes } from '../../api/src/routes/match-analysis';
import { matchStatsRoutes } from '../../api/src/routes/match-stats';
import { gameStateRoutes } from '../../api/src/routes/game-state';
import { gameStateGsiRoutes } from '../../api/src/routes/game-state-gsi';
import { demoRoutes } from '../../api/src/routes/demo';

type Handler = (request: any, reply: any) => unknown | Promise<unknown>;
type RouteOptions = { preHandler?: Handler | Handler[] };
type Route = { method: string; path: string; handler: Handler; preHandler?: Handler | Handler[] };

export class WorkerRouter {
  readonly routes: Route[] = [];
  get(path: string, optionsOrHandler: RouteOptions | Handler, maybeHandler?: Handler): void { this.add('GET', path, optionsOrHandler, maybeHandler); }
  post(path: string, optionsOrHandler: RouteOptions | Handler, maybeHandler?: Handler): void { this.add('POST', path, optionsOrHandler, maybeHandler); }
  delete(path: string, optionsOrHandler: RouteOptions | Handler, maybeHandler?: Handler): void { this.add('DELETE', path, optionsOrHandler, maybeHandler); }
  put(path: string, optionsOrHandler: RouteOptions | Handler, maybeHandler?: Handler): void { this.add('PUT', path, optionsOrHandler, maybeHandler); }
  patch(path: string, optionsOrHandler: RouteOptions | Handler, maybeHandler?: Handler): void { this.add('PATCH', path, optionsOrHandler, maybeHandler); }
  private add(method: string, path: string, optionsOrHandler: RouteOptions | Handler, maybeHandler?: Handler): void {
    const options = typeof optionsOrHandler === 'function' ? {} : optionsOrHandler;
    const handler = typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler;
    if (!handler) throw new Error(`Missing handler for ${method} ${path}`);
    this.routes.push({ method, path, handler, preHandler: options.preHandler });
  }
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean), b = pathname.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 1) {
    const expected = a[i]!, actual = b[i]!;
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return params;
}

function normalizeHeaders(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  request.headers.forEach((value, key) => { result[key.toLowerCase()] = value; });
  return result;
}

async function parseBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const text = await request.text();
  if (!text) return undefined;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

function responseWithCors(response: Response, origin?: string, allowedOrigins: string[] = []): Response {
  const headers = new Headers(response.headers);
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(payload: unknown, status: number, headers?: Headers): Response {
  const out = new Headers(headers);
  out.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers: out });
}

export async function createWorkerRouter(config: AppConfig): Promise<WorkerRouter> {
  const router = new WorkerRouter();
  const app = router as any;
  await healthRoutes(app, config);
  await telegramAuthRoutes(app, config);
  await faceitAuthRoutes(app, config);
  await faceitProfileRoutes(app, config);
  await faceitWebhookRoutes(app, config);
  await subscriptionRoutes(app, config);
  await matchesRoutes(app, config);
  await matchAnalysisRoutes(app, config);
  await matchStatsRoutes(app, config);
  await gameStateRoutes(app, config);
  await gameStateGsiRoutes(app, config);
  await demoRoutes(app, config);
  return router;
}

export async function handleWorkerRequest(request: Request, router: WorkerRouter, config: AppConfig): Promise<Response> {
  const url = new URL(request.url), origin = request.headers.get('origin') ?? undefined;
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? 'Authorization,Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return responseWithCors(new Response(null, { status: 204, headers }), origin, config.env.allowedOrigins);
  }
  const route = router.routes.find((candidate) => candidate.method === request.method && matchPath(candidate.path, url.pathname) !== null);
  if (!route) return responseWithCors(jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404), origin, config.env.allowedOrigins);
  const params = matchPath(route.path, url.pathname)!;
  const body = await parseBody(request);
  const req: any = { body, params, query: Object.fromEntries(url.searchParams.entries()), headers: normalizeHeaders(request), method: request.method, url: `${url.pathname}${url.search}`, raw: request, ip: request.headers.get('cf-connecting-ip') ?? undefined };
  let status = 200;
  const headers = new Headers();
  let sentResponse: Response | undefined;
  const reply: any = {
    send(payload: unknown) { sentResponse = payload instanceof Response ? payload : jsonResponse(payload, status, headers); return sentResponse; },
    status(code: number) { status = code; return reply; },
    code(code: number) { status = code; return reply; },
    header(name: string, value: string) { headers.set(name, value); return reply; },
    type(value: string) { headers.set('content-type', value); return reply; },
    redirect(location: string, code = 302) { status = code; headers.set('location', location); sentResponse = new Response(null, { status, headers }); return sentResponse; },
  };
  try {
    const preHandlers = route.preHandler ? (Array.isArray(route.preHandler) ? route.preHandler : [route.preHandler]) : [];
    for (const preHandler of preHandlers) await preHandler(req, reply);
    const result = await route.handler(req, reply);
    if (sentResponse) return responseWithCors(sentResponse, origin, config.env.allowedOrigins);
    if (result instanceof Response) return responseWithCors(result, origin, config.env.allowedOrigins);
    return responseWithCors(jsonResponse(result ?? { ok: true }, status, headers), origin, config.env.allowedOrigins);
  } catch (error) {
    const errorBody = isAppError(error) ? toErrorBody(error) : { ok: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error) } };
    const errorStatus = isAppError(error) ? (error.status ?? 500) : 500;
    return responseWithCors(jsonResponse(errorBody, errorStatus), origin, config.env.allowedOrigins);
  }
}
