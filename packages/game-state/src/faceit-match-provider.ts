/**
 * FaceitMatchProvider (spec §30): polls FACEIT for a watched match and emits
 * normalized diffs as `GameEvent`s. It is the production default provider —
 * but only while a FACEIT API key is configured. Without a key `available` is
 * false and the app must never pretend real-time data exists.
 */
import {
  AppError,
  codes,
  createLogger,
  formatClockMs,
  type FaceitTeamRef,
  type GameEvent,
  type Logger,
} from '@cs2coach/shared';
import type { FaceitApiClient, FaceitFaction } from '@cs2coach/faceit';

type Emit = (events: GameEvent[]) => void;

interface WatchedMatch {
  timer: NodeJS.Timeout;
  lastStatus?: string;
  lastScoreA?: number;
  lastScoreB?: number;
  lastMap?: string;
  started: boolean;
  emissAck: boolean;
}

export class FaceitMatchProvider {
  private readonly watched = new Map<string, WatchedMatch>();
  private readonly logger: Logger;
  readonly realtimeGameData = true;

  constructor(
    private readonly client: FaceitApiClient,
    logger?: Logger
  ) {
    this.logger = logger ?? createLogger('faceit-provider');
  }

  /** Real-time data is available only when a production key is configured. */
  get available(): boolean {
    return this.client.hasApiKey();
  }

  watchMatch(matchId: string, emit: Emit, pollMs = 30_000): void {
    if (!this.available) {
      throw new AppError(codes.faceitNotConnected, 'FACEIT is not configured — cannot poll live data');
    }
    if (this.watched.has(matchId)) return;

    const watcher: WatchedMatch = {
      lastStatus: undefined,
      lastScoreA: undefined,
      lastScoreB: undefined,
      lastMap: undefined,
      started: false,
      emissAck: true,
      timer: setInterval(() => void this.poll(matchId, emit, watcher), pollMs),
    };
    this.watched.set(matchId, watcher);
    this.logger.info('watch_started', { matchId, pollMs });
    void this.poll(matchId, emit, watcher);
  }

  unwatchMatch(matchId: string): void {
    const watcher = this.watched.get(matchId);
    if (watcher) {
      clearInterval(watcher.timer);
      this.watched.delete(matchId);
    }
  }

  stopAll(): void {
    for (const [id, w] of this.watched) {
      clearInterval(w.timer);
      this.watched.delete(id);
    }
  }

  private async poll(matchId: string, emit: Emit, watcher: WatchedMatch): Promise<void> {
    const match = await this.client.getMatchById(matchId).catch((err) => {
      this.logger.warn('watch_poll_failed', { matchId, error: err?.message ?? String(err) });
      return null;
    });
    if (!match) return;

    // FACEIT Data API v4 fields (see packages/faceit/src/types.ts):
    //   `details.map` — selected map; `results.score` — {faction1, faction2}
    //   `teams` — Record<factionId, FaceitFaction>
    const map = match.details?.map;
    const status = match.status;
    const scoreA = match.results?.score?.faction1 ?? 0;
    const scoreB = match.results?.score?.faction2 ?? 0;
    const events: GameEvent[] = [];
    const roundMs = 115_000; // CS2 round length ceiling — used only for clock formatting

    if (watcher.lastStatus === undefined) {
      events.push({
        type: status === 'FINISHED' ? 'match_status_finished' : status === 'CONFIGURING' || status === 'READY' ? 'match_status_ready' : 'match_started',
        matchId,
        ts: Date.now(),
        teams: status === 'FINISHED' ? undefined : normalizeTeams(match.teams),
      });
    } else if (watcher.lastStatus !== status && status === 'FINISHED') {
      events.push({ type: 'match_status_finished', matchId, ts: Date.now() });
    } else if (watcher.lastStatus !== status && (status === 'STARTED' || status === 'LIVE')) {
      events.push({ type: 'match_started', matchId, ts: Date.now(), map, teams: normalizeTeams(match.teams) });
    }

    if (watcher.lastScoreA !== scoreA || watcher.lastScoreB !== scoreB) {
      events.push({ type: 'score_updated', matchId, ts: Date.now(), scoreA, scoreB });
    }
    if (map && watcher.lastMap !== map) {
      events.push({ type: 'map_selected', matchId, ts: Date.now(), map });
    }

    watcher.lastStatus = status;
    watcher.lastScoreA = scoreA;
    watcher.lastScoreB = scoreB;
    watcher.lastMap = map;

    if (events.length > 0) {
      this.logger.info('poll_emitted', { matchId, events: events.map((e) => e.type), clock: formatClockMs(roundMs) });
      emit(events);
    }
    if (status === 'FINISHED') this.unwatchMatch(matchId);
  }
}

function normalizeTeams(teams: Record<string, FaceitFaction> | undefined): { a: FaceitTeamRef; b: FaceitTeamRef } | undefined {
  const factions = teams ? Object.values(teams) : [];
  if (factions.length < 2) return undefined;
  const toRef = (f: FaceitFaction): FaceitTeamRef => ({
    teamId: f.team_id ?? f.faction_id,
    name: f.nickname,
    players: (f.roster ?? f.members ?? []).map((m) => ({
      faceitPlayerId: m.player_id,
      nickname: m.nickname,
      avatar: m.avatar,
      skillLevel: m.skill_level,
    })),
  });
  return { a: toRef(factions[0]), b: toRef(factions[1]) };
}