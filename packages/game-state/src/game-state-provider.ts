/**
 * Provider abstraction (spec §23, §64, §65).
 *
 * FACEIT platform data and CS2 game-state data are separate. Every source of
 * match facts plugs in behind this interface; engines never couple to a
 * specific provider. A provider marks `realtimeGameData` true only when it can
 * legitimately observe per-round/per-frame CS2 state (positions, kills, utility).
 */
import type { GameEvent } from '@cs2coach/shared';

export type GameStateListener = (event: GameEvent) => void;

export interface GameStateProvider {
  readonly id: string;
  /** True only for sources that observe real-time CS2 game state. */
  readonly realtimeGameData: boolean;
  /** True when this provider has enough configuration to fetch real data. */
  readonly available: boolean;
  start(): void;
  stop(): void;
  subscribe(listener: GameStateListener): () => void;
}

export interface ProviderRegistry {
  providers: GameStateProvider[];
  add(provider: GameStateProvider): void;
  remove(id: string): void;
  /** All providers that can deliver real-time game state. */
  realtimeProviders(): GameStateProvider[];
}

export class InMemoryProviderRegistry implements ProviderRegistry {
  private list: GameStateProvider[] = [];

  get providers(): GameStateProvider[] {
    return [...this.list];
  }

  add(provider: GameStateProvider): void {
    if (!this.list.some((p) => p.id === provider.id)) this.list.push(provider);
  }

  remove(id: string): void {
    this.list = this.list.filter((p) => p.id !== id);
  }

  realtimeProviders(): GameStateProvider[] {
    return this.list.filter((p) => p.realtimeGameData && p.available);
  }
}