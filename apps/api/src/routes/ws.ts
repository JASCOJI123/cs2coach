/**
 * WebSocket live-coach route: authenticated users may subscribe only to their
 * own FACEIT match. Browsers pass the session JWT in the query string.
 */
import type { FastifyInstance } from 'fastify';
import { findFaceitAccountByUserId, getMatchByFaceitId } from '@cs2coach/database';
import type { AppConfig } from '../config';
import type { WebSocketManager } from '../ws/websocket-manager';
import { userOwnsMatch } from './matches';

export async function wsRoutes(app: FastifyInstance, config: AppConfig, wsManager: WebSocketManager): Promise<void> {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const ws = socket.socket ?? socket;
    const q = request.query as { matchId?: string; token?: string };
    const faceitMatchId = q.matchId ?? '';
    const token = q.token ?? '';
    const claims = config.verifySession(token);
    if (!claims) { ws.close(4001, 'unauthorized'); return; }
    if (!faceitMatchId) { ws.close(4002, 'missing matchId'); return; }

    const match = await getMatchByFaceitId(config.db, faceitMatchId).catch(() => null);
    const account = await findFaceitAccountByUserId(config.db, claims.sub).catch(() => null);
    const owns = match ? await userOwnsMatch(config, claims.sub, match.id).catch(() => false) : false;
    if (!account || !match || !owns) { ws.close(4003, 'match not found'); return; }

    const clientId = `${claims.sub}-${Date.now().toString(36)}`;
    wsManager.register(clientId, faceitMatchId, (payload) => { if (ws.readyState === 1) ws.send(JSON.stringify(payload)); });
    const state = config.matchStateEngine.getState(faceitMatchId);
    if (state) ws.send(JSON.stringify({ type: 'match_state', matchId: faceitMatchId, state }));
    ws.on('message', () => wsManager.markAlive(clientId));
    ws.on('close', () => wsManager.unregister(clientId));
    ws.on('error', () => wsManager.unregister(clientId));
  });
}
