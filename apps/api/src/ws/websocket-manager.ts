/**
 * WebSocketManager (spec §32): tracks connected clients and their subscribed
 * matchIds, buffers state so a client connecting mid-match always gets the
 * current state immediately, and broadcasts per-match updates.
 */
import { createLogger, type Logger, type MatchState } from '@cs2coach/shared';
import { stateForTeam, type TeamSide } from './team-view';

interface ClientConnection {
  matchId: string;
  team: TeamSide;
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

  register(clientId: string, matchId: string, team: TeamSide, send: (payload: unknown) => void): void {
    this.clients.set(clientId, { matchId, team, send, isAlive: true });
    this.logger.info('ws_client_connected', { clientId, matchId });
  }

  unregister(clientId: string): void {
    this.clients.delete(clientId);
  }

  markAlive(clientId: string): void {
    const c = this.clients.get(clientId);
    if (c) c.isAlive = true;
  }

  /** Send a live state snapshot to every client subscribed to this match, filtered to the client's own team. */
  broadcastState(matchId: string, state: MatchState): void {
    this.broadcast(matchId, (client) => ({ type: 'match_state', matchId, state: stateForTeam(state, client.team) }));
  }

  /** A decision is coaching for one team; never deliver it to the opponents. */
  broadcastDecision(matchId: string, decision: unknown, team?: TeamSide): void {
    this.broadcast(matchId, (client) => (team && client.team !== team ? null : { type: 'ai_decision', matchId, decision }));
  }

  private broadcast(matchId: string, build: (client: ClientConnection) => WsEvent | null): void {
    for (const [clientId, client] of this.clients) {
      if (client.matchId !== matchId) continue;
      const payload = build(client);
      if (!payload) continue;
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