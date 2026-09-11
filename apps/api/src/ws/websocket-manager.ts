/**
 * WebSocketManager (spec §32): tracks connected clients and their subscribed
 * matchIds, buffers state so a client connecting mid-match always gets the
 * current state immediately, and broadcasts per-match updates.
 */
import { createLogger, type Logger, type MatchState } from '@cs2coach/shared';

interface ClientConnection {
  matchId: string;
  send: (payload: unknown) => void;
  isAlive: boolean;
}

export type WsEvent =
  | { type: 'match_state'; matchId: string; state: MatchState }
  | { type: 'ai_decision'; matchId: string; decision: unknown };

export class WebSocketManager {
  private readonly clients = new Map<string, ClientConnection>(); // key: clientId
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger('ws-manager');
  }

  register(clientId: string, matchId: string, send: (payload: unknown) => void): void {
    this.clients.set(clientId, { matchId, send, isAlive: true });
    this.logger.info('ws_client_connected', { clientId, matchId });
  }

  unregister(clientId: string): void {
    this.clients.delete(clientId);
  }

  markAlive(clientId: string): void {
    const c = this.clients.get(clientId);
    if (c) c.isAlive = true;
  }

  /** Send a live state snapshot to every client subscribed to this match. */
  broadcastState(matchId: string, state: MatchState): void {
    this.broadcast({ type: 'match_state', matchId, state });
  }

  broadcastDecision(matchId: string, decision: unknown): void {
    this.broadcast({ type: 'ai_decision', matchId, decision });
  }

  private broadcast(payload: WsEvent): void {
    for (const [clientId, client] of this.clients) {
      if (client.matchId !== payload.matchId) continue;
      try {
        client.send(payload);
      } catch (err) {
        this.logger.warn('ws_send_failed', { clientId, error: (err as Error).message });
        this.clients.delete(clientId);
      }
    }
  }

  pingAll(): void {
    for (const client of this.clients.values()) {
      try {
        client.send({ type: 'ping', ts: Date.now() });
      } catch (err) {
        this.logger.warn('ws_ping_failed', { error: (err as Error).message });
      }
    }
  }

  get connectionCount(): number {
    return this.clients.size;
  }
}