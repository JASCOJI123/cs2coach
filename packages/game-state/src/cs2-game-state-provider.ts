/**
 * CS2GameStateProvider (spec §30): the real-time seam for a future CS2 GSI /
 * custom real-time source. Today no production source is wired, so
 * `available` is always `false` — the API surface accepts normalized events
 * via POST /api/game-state/events from an authorized real source in the
 * future, never from a demo stream.
 */
import { createLogger, type Logger } from '@cs2coach/shared';

export class CS2GameStateProvider {
  readonly realtimeGameData = true;
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger('cs2-state-provider');
  }

  get available(): boolean {
    return false;
  }

  async start(): Promise<void> {
    this.logger.info('cs2_state_provider_started', { available: false });
  }

  async stop(): Promise<void> {
    // no-op — nothing to tear down
  }
}