/**
 * OpponentModel (spec §27): learns probabilistic facts about the enemy ONLY
 * from real events. Nothing is seeded; with zero events every signal stays LOW
 * confidence and the UI must show "not enough data".
 */
import {
  confidenceFromScore,
  epochNow,
  type FaceitPlayerRef,
  type GameEvent,
  type MatchState,
  type OpponentPattern,
} from '@cs2coach/shared';

type PatternType = 'position' | 'site' | 'aggression' | 'utility' | 'rotation' | 'clutch' | 'execute';

interface Accumulator {
  location: string;
  patternType: PatternType;
  count: number;
  players: Map<string, FaceitPlayerRef>;
}

const MAX_PATTERNS = 12;

export class OpponentModel {
  private readonly byKey = new Map<string, Accumulator>();

  /** Reset per match — call on match_created. */
  reset(): void {
    this.byKey.clear();
  }

  /** Engine hook: updates state.opponentPatterns from each real event. */
  learn(state: MatchState, event: GameEvent): void {
    if (event.type === 'match_created') {
      this.reset();
      return;
    }

    switch (event.type) {
      case 'player_kill': {
        if (event.site) {
          this.inc(`site:${event.site}`, 'site', event.site === 'A' ? 'Preferring site A engagements' : 'Preferring site B engagements', event.killer);
        }
        if (event.weapon && /awp|sniper/.test(event.weapon)) {
          this.inc(`awp:${event.killer.nickname.toLowerCase()}`, 'position', `${event.killer.nickname} holds with the AWP`, event.killer);
        }
        break;
      }
      case 'bomb_state': {
        if (event.planted && event.site) {
          this.inc(`execute:${event.site}`, 'execute', `Executes on site ${event.site}`, undefined);
        }
        break;
      }
      case 'round_ended': {
        if (state.bomb.planted && state.bomb.site) {
          this.inc(`site:${state.bomb.site}`, 'site', `Preferring site ${state.bomb.site}`, undefined);
        }
        break;
      }
      default:
        break;
    }

    state.opponentPatterns = this.summarize();
  }

  private inc(location: string, patternType: PatternType, description: string, player: FaceitPlayerRef | undefined): void {
    const key = `${location}|${player?.faceitPlayerId ?? '*'}`;
    const existing = this.byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (player) existing.players.set(player.faceitPlayerId, player);
    } else {
      this.byKey.set(key, {
        location,
        patternType,
        count: 1,
        players: player ? new Map([[player.faceitPlayerId, player]]) : new Map(),
      });
    }
    if (this.byKey.size > MAX_PATTERNS * 3) {
      const first = this.byKey.keys().next().value as string | undefined;
      if (first) this.byKey.delete(first);
    }
  }

  private summarize(): OpponentPattern[] {
    const byLocation = new Map<string, Accumulator>();
    for (const acc of this.byKey.values()) {
      const key = acc.location;
      const existing = byLocation.get(key);
      if (existing) {
        existing.count += acc.count;
        for (const [id, p] of acc.players) existing.players.set(id, p);
      } else {
        byLocation.set(key, { ...acc, players: new Map(acc.players) });
      }
    }

    const total = Math.max(1, [...byLocation.values()].reduce((acc2, p) => acc2 + p.count, 0));
    const now = epochNow();

    const patterns: OpponentPattern[] = [...byLocation.values()]
      .map((acc): OpponentPattern => {
        const p = [...acc.players.values()][0] ?? {
          faceitPlayerId: acc.location,
          nickname: acc.location,
        };
        return {
          player: p,
          playerId: p.faceitPlayerId,
          patternType: acc.patternType,
          location: acc.location,
          frequency: roundTo(acc.count / total, 3),
          // trust grows with real samples: 5+ → HIGH, 3-4 → MEDIUM, else LOW
          confidence: confidenceFromScore(Math.min(1, acc.count / 5)),
          sampleSize: acc.count,
          updatedAt: now,
        };
      })
      .sort((a, b) => b.sampleSize - a.sampleSize)
      .slice(0, MAX_PATTERNS);

    // If there is a recognized dominant site, surface it first.
    return patterns;
  }
}

function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}