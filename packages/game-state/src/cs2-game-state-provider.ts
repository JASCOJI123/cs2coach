import { createLogger, type GameEvent, type Logger } from '@cs2coach/shared';
import { normalizeGsiSnapshot, type GsiSnapshot } from './gsi-normalizer';
export interface CS2GsiSink { onEvents: (events: GameEvent[]) => void | Promise<void>; }
export class CS2GameStateProvider {
  readonly realtimeGameData = true;
  private readonly logger: Logger;
  private readonly sinks = new Set<CS2GsiSink>();
  private readonly last = new Map<string, GsiSnapshot>();
  private running = false;
  constructor(logger?: Logger) { this.logger = logger ?? createLogger('cs2-state-provider'); }
  get available(): boolean { return this.running; }
  subscribe(sink: CS2GsiSink): () => void { this.sinks.add(sink); return () => this.sinks.delete(sink); }
  async start(): Promise<void> { this.running = true; this.logger.info('cs2_state_provider_started', { available: true }); }
  async stop(): Promise<void> { this.running = false; this.last.clear(); }
  ingest(matchId: string, body: unknown): GameEvent[] {
    const snapshot = normalizeGsiSnapshot(body) as GsiSnapshot;
    const previous = this.last.get(matchId);
    const events = previous ? normalizeGsiSnapshot(body, previous) as GameEvent[] : [];
    this.last.set(matchId, snapshot);
    if (events.length) for (const sink of this.sinks) void sink.onEvents(events);
    return events;
  }
  clear(matchId: string): void { this.last.delete(matchId); }
}
