/**
 * WebSocket live-coach client with exponential backoff and graceful REST
 * fallback (spec §32, §47). The server pushes full `match_state` snapshots;
 * this client forwards them to a handler and auto-reconnects on drop, while
 * the UI layer keeps polling REST as a safety net.
 */
import { apiUrl } from './api';
import type { MatchStateLite, TacticalDecisionLite, WsMessage } from './types';

export interface LiveCoachHandlers {
  onState: (state: MatchStateLite) => void;
  onDecision: (decision: TacticalDecisionLite) => void;
  onConnection: (connected: boolean) => void;
}

const MAX_BACKOFF_MS = 15_000;

export function openLiveCoach(matchId: string, token: string, handlers: LiveCoachHandlers): () => void {
  let socket: WebSocket | null = null;
  let closedByUser = false;
  let retryCount = 0;
  let reconnectTimer: number | null = null;

  const connect = () => {
    if (closedByUser) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = apiUrl('');
    const endpoint = base.startsWith('http')
      ? `${protocol}//${base.replace(/^https?:\/\//, '')}/ws`
      : `${protocol}//${window.location.host}/ws`;
    const url = `${endpoint}?matchId=${encodeURIComponent(matchId)}&token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    socket = ws;
    handlers.onConnection(true);

    ws.onopen = () => {
      retryCount = 0;
      handlers.onConnection(true);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsMessage;
        if (msg.type === 'ping') return;
        if (msg.state) handlers.onState(msg.state);
        if (msg.decision) handlers.onDecision(msg.decision);
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = () => {
      handlers.onConnection(false);
      if (closedByUser) return;
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** retryCount);
      retryCount += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  };

  connect();

  return () => {
    closedByUser = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}