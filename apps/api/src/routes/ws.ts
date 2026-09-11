/**
 * WebSocket live-coach route (spec §32): subscribe to a match's live state.
 * Clients authenticate via the same Bearer JWT in the query string (browsers
 * cannot set headers on new WebSocket) and receive:
 *   { type: 'match_state', matchId, state }   — full state, on connect + updates
 *   { type: 'ai_decision',  matchId, decision } — new tactical decision
 *   { type: 'ping', ts }                       — heartbeat
 */
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config';
import type { WebSocketManager } from '../ws/websocket-manager';

export async function wsRoutes(app: FastifyInstance, config: AppConfig, wsManager: WebSocketManager): Promise<void> {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const q = request.query as { matchId?: string; token?: string };
    const matchId = q.matchId ?? '';
    const token = q.token ?? '';

    const claims = config.verifySession(token);
    if (!claims) {
      socket.socket.close(4001, 'unauthorized');
      return;
    }
    if (!matchId) {
      socket.socket.close(4002, 'missing matchId');
      return;
    }

    const clientId = `${claims.sub}-${Date.now().toString(36)}`;
    const ws = socket.socket;

    wsManager.register(clientId, matchId, (payload) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });

    // Send current snapshot immediately
    const state = config.matchStateEngine.getState(matchId);
    if (state) wsManager.broadcastState(matchId, state);

    ws.on('message', () => wsManager.markAlive(clientId));
    ws.on('close', () => wsManager.unregister(clientId));
    ws.on('error', () => wsManager.unregister(clientId));
  });
}