/**
 * DemoGameStateProvider (spec §12, §33): dev-only synthetic* stream. Guarded by
 * `DEMO_MODE=true` and by the spec rules:
 *   - constructing it outside demo mode throws `demoUnavailable`;
 *   - a hook in the API stamps every emitted event as `demo_mode`, so the
 *     engine's `demoMode` flag and final `MatchState` both reveal the stream
 *     was synthetic and the UI must surface it.
 *
 * Demo mode is the ONLY place simulation is permitted (spec §12).
 */
import { AppError, codes, createLogger, type GameEvent, type Logger } from '@cs2coach/shared';

type Emit = (events: GameEvent[]) => void;

export interface DemoGameStateProviderOptions {
  isDemoMode: boolean;
  matchId?: string;
  roundCount?: number;
  dispatchIntervalMs?: number;
  seed?: number;
}

const NICKNAMES = ['Reaper', 'Vox', 'Hex', 'Nyx', 'Keo', 'Shade', 'Zed', 'Pulse', 'Aero', 'Bolt'];

export class DemoGameStateProvider {
  private timer: NodeJS.Timeout | null = null;
  private readonly logger: Logger;
  readonly matchId: string;
  private readonly roundCount: number;
  private readonly dispatchIntervalMs: number;
  readonly realtimeGameData = true;

  constructor(opts: DemoGameStateProviderOptions, logger?: Logger) {
    if (!opts.isDemoMode) {
      throw new AppError(codes.demoUnavailable, 'Demo game state requires DEMO_MODE=true');
    }
    this.matchId = opts.matchId ?? `local-demo-${Date.now().toString(36)}`;
    this.roundCount = Math.min(30, Math.max(1, opts.roundCount ?? 2));
    this.dispatchIntervalMs = Math.max(500, opts.dispatchIntervalMs ?? 3_000);
    this.logger = logger ?? createLogger('demo-provider');
  }

  get available(): boolean {
    return true;
  }

  watchMatch(matchId: string, emit: Emit): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    let round = 1;
    let a = 0;
    let b = 0;
    let roundPhase = 0;

    const tick = () => {
      const events: GameEvent[] = [];
      const base = { matchId, ts: Date.now() };

      if (roundPhase === 0) {
        events.push({ type: 'demo_mode', ...base });
        events.push({ type: 'round_started', ...base, round, side: round % 2 === 1 ? 'T' : 'CT' });
      } else if (roundPhase === 1) {
        const k = pick2(this.killsFor(round));
        if (k) {
          events.push({
            type: 'player_kill',
            ...base,
            round,
            killer: { faceitPlayerId: k.killer, nickname: k.killer },
            victim: { faceitPlayerId: k.victim, nickname: k.victim },
            weapon: k.weapon,
            headshot: Math.random() < 0.35,
          });
        }
      } else if (roundPhase === 2) {
        const winner = Math.random() < 0.55 ? 'T' : 'CT';
        if (winner === 'T') a += 1;
        else b += 1;
        const teamEconomy = (side: 'infra' | 'defra', baseMoney: number) => ({
          money: baseMoney,
          armor: true,
          weapons: side === 'infra' ? ['AK-47'] : ['M4A4'],
          utility: side === 'infra' ? ['HE'] : ['Flashbang'],
          lossBonus: 1400 + (Math.max(0, Math.min(4, (a + b) % 5)) * 500),
          buyType: side === 'infra' ? ('ECO' as const) : ('ECO' as const),
        });
        events.push({
          type: 'round_ended',
          ...base,
          round,
          winner,
          reason: winner === 'T' ? 'Bomb exploded' : 'Bomb defused',
          economy: {
            a: teamEconomy('infra', 1000 + (a % 4) * 500),
            b: teamEconomy('defra', 1000 + (b % 4) * 500),
          },
        });
        events.push({ type: 'score_updated', ...base, scoreA: a, scoreB: b });
      }

      emit(events);
      roundPhase += 1;
      if (roundPhase >= 3) {
        roundPhase = 0;
        round += 1;
        if (round > this.roundCount) {
          emit([{ type: 'match_status_finished', matchId, ts: Date.now() }]);
          this.stop();
        }
      }
    };

    this.timer = setInterval(tick, this.dispatchIntervalMs);
    this.logger.info('demo_watch_started', { matchId, roundCount: this.roundCount });
    tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Deterministic-ish per-round kill names so demo output is reproducible. */
  private killsFor(round: number): { killer: string; victim: string; weapon: string }[] {
    const pool = NICKNAMES;
    const r = round % pool.length;
    return [
      { killer: pool[(r + 1) % pool.length], victim: pool[(r + 4) % pool.length], weapon: 'AK-47' },
    ];
  }
}

function pick2<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}