/**
 * In-memory event bus (spec §24). Fans normalized `GameEvent`s out to every
 * pipeline stage. Event listening order does not matter here — stages are
 * functional and apply against the latest MatchState.
 */
import { createLogger, type GameEvent, type Logger } from '@cs2coach/shared';

export type GameEventListener = (event: GameEvent) => void;

export class GameEventBus {
  private readonly listeners = new Set<GameEventListener>();
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger('event-bus');
  }

  subscribe(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: GameEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.logger.warn('event_listener_error', {
          eventType: event.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  publishAll(events: GameEvent[]): void {
    for (const event of events) this.publish(event);
  }
}