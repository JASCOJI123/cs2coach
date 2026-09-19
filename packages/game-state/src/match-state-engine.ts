/**
 * MatchStateEngine (spec §22, §24): reduces normalized `GameEvent`s into a
 * single authoritative `MatchState` per match, held in memory for the active
 * process. Important state is mirrored to Neon by the API layer; the engine
 * itself never touches the database.
 */
import { emptyMatchState, epochNow, hashMatchState, type GameEvent, type MatchState, type MatchPlayer, type PlayerRole } from '@cs2coach/shared';
import { RoundEngine } from './round-engine';

export interface MatchStateEngineOptions { onStateChange?: (matchId: string, state: MatchState) => void; learn?: (state: MatchState, event: GameEvent) => void; defaultRole?: PlayerRole; }

export class MatchStateEngine {
  private readonly states = new Map<string, MatchState>();
  private readonly onStateChange?: (matchId: string, state: MatchState) => void;
  private readonly learn?: (state: MatchState, event: GameEvent) => void;
  private readonly roundEngine = new RoundEngine();
  readonly defaultRole: PlayerRole;
  private pendingKills = new Map<string, GameEvent[]>();

  constructor(opts: MatchStateEngineOptions = {}) { this.onStateChange = opts.onStateChange; this.learn = opts.learn; this.defaultRole = opts.defaultRole ?? 'RIFLER'; }
  has(matchId: string): boolean { return this.states.has(matchId); }
  createMatch(matchId: string, initial?: Partial<MatchState>): MatchState { const state: MatchState = { ...emptyMatchState(matchId), ...initial }; state.stateVersion = 1; state.stateHash = hashMatchState(state); state.timestamp = epochNow(); this.states.set(matchId, state); return state; }
  getState(matchId: string): MatchState | null { return this.states.get(matchId) ?? null; }
  getActiveMatchIds(): string[] { return [...this.states.keys()]; }
  removeMatch(matchId: string): void { this.states.delete(matchId); this.pendingKills.delete(matchId); }
  applyEvents(events: GameEvent[]): MatchState | null { let last: MatchState | null = null; for (const event of events) { const state = this.applyEvent(event); if (state) last = state; } return last; }

  applyEvent(event: GameEvent): MatchState | null {
    switch (event.type) {
      case 'match_created': { let state = this.states.get(event.matchId); if (!state) { state = this.createMatch(event.matchId); this.bump(state, event); } return state; }
      case 'match_status_ready': { const state = this.ensure(event.matchId); if (!state) return null; state.status = 'ready'; this.bump(state, event); return state; }
      case 'match_started': { const state = this.ensure(event.matchId); if (!state) return null; state.status = 'ongoing'; state.phase = 'live'; if (event.map) state.map = event.map; if (event.teams) state.teams = event.teams; state.aiStatus = 'ANALYZING'; state.gameDataAvailable = true; this.bump(state, event); return state; }
      case 'match_status_finished': { const state = this.ensure(event.matchId); if (!state) return null; state.status = 'finished'; state.phase = 'post_match'; state.aiStatus = 'READY'; state.alivePlayers = []; state.players = state.players.map((p) => ({ ...p, alive: false })); this.bump(state, event); return state; }
      case 'match_status_aborted':
      case 'match_status_cancelled': { const state = this.ensure(event.matchId); if (!state) return null; state.status = event.type === 'match_status_aborted' ? 'aborted' : 'cancelled'; this.bump(state, event); return state; }
      case 'round_started': { const state = this.ensure(event.matchId); if (!state) return null; state.round = event.round; state.side = event.side; state.phase = 'live'; state.players = state.players.map((p) => ({ ...p, alive: true })); state.alivePlayers = state.players.filter((p) => p.alive); this.bump(state, event); return state; }
      case 'round_ended': { const state = this.ensure(event.matchId); if (!state) return null; state.phase = 'live'; const result = this.roundEngine.finalizeRound(state, event, this.pendingKills.get(event.matchId) ?? []); state.previousRounds = [...state.previousRounds, result].slice(-30); if (event.economy) state.economy = event.economy; this.pendingKills.delete(event.matchId); this.bump(state, event); return state; }
      case 'score_updated': { const state = this.ensure(event.matchId); if (!state) return null; state.score.a = event.scoreA; state.score.b = event.scoreB; this.bump(state, event); return state; }
      case 'player_connect': { const state = this.ensure(event.matchId, true); if (!state) return null; this.upsertPlayer(state, { faceitPlayerId: event.player.faceitPlayerId, nickname: event.player.nickname, team: event.team }); this.bump(state, event); return state; }
      case 'player_state_updated': {
        const state = this.ensure(event.matchId, true);
        if (!state) return null;
        state.gameDataAvailable = true;
        state.status = 'ongoing';
        state.phase = 'live';
        state.aiStatus = 'ANALYZING';
        const player = this.upsertPlayer(state, { faceitPlayerId: event.player.faceitPlayerId, nickname: event.player.nickname, team: event.team });
        player.alive = event.alive;
        if (event.hp !== undefined) player.hp = Math.max(0, Math.min(100, event.hp));
        if (event.kills !== undefined) player.kills = Math.max(0, event.kills);
        if (event.deaths !== undefined) player.deaths = Math.max(0, event.deaths);
        if (event.assists !== undefined) player.assists = Math.max(0, event.assists);
        if (event.weapons) player.weapons = event.weapons.slice(0, 16);
        if (event.position) {
          const samples = state.positions[event.player.faceitPlayerId] ?? [];
          state.positions[event.player.faceitPlayerId] = [...samples, { ...event.position, ts: event.ts }].slice(-30);
        }
        state.alivePlayers = state.players.filter((p) => p.alive);
        this.bump(state, event);
        return state;
      }
      case 'player_kill': { const state = this.ensure(event.matchId); if (!state) return null; this.upsertPlayer(state, { faceitPlayerId: event.killer.faceitPlayerId, nickname: event.killer.nickname, team: state.teams?.a?.players?.some((p) => p.faceitPlayerId === event.killer.faceitPlayerId) ? 'A' : 'B' }); this.upsertPlayer(state, { faceitPlayerId: event.victim.faceitPlayerId, nickname: event.victim.nickname, team: state.teams?.b?.players?.some((p) => p.faceitPlayerId === event.victim.faceitPlayerId) ? 'B' : 'A' }); const killer = state.players.find((p) => p.faceitPlayerId === event.killer.faceitPlayerId); const victim = state.players.find((p) => p.faceitPlayerId === event.victim.faceitPlayerId); if (killer) killer.kills += 1; if (victim) { victim.deaths += 1; victim.alive = false; } state.alivePlayers = state.players.filter((p) => p.alive); const list = this.pendingKills.get(event.matchId) ?? []; list.push(event); this.pendingKills.set(event.matchId, list); this.bump(state, event); return state; }
      case 'bomb_state': { const state = this.ensure(event.matchId); if (!state) return null; state.bomb = { planted: event.planted, site: event.site, defused: event.defused }; this.bump(state, event); return state; }
      case 'map_selected': { const state = this.ensure(event.matchId); if (!state) return null; state.map = event.map; this.bump(state, event); return state; }
      case 'veto_updated': { const state = this.ensure(event.matchId); if (!state) return null; state.veto = event.veto; if (event.map) state.map = event.map; if (event.teams?.a && event.teams?.b) state.teams = event.teams; this.bump(state, event); return state; }
      case 'demo_mode': { const state = this.ensure(event.matchId, true); if (!state) return null; state.demoMode = true; state.gameDataAvailable = true; this.bump(state, event); return state; }
      case 'match_demo_ready': { const state = this.ensure(event.matchId); if (!state) return null; this.bump(state, event); return state; }
      default: { const exhaustive: never = event; return exhaustive; }
    }
  }

  private ensure(matchId: string, create = false): MatchState | null { let state = this.states.get(matchId); if (!state && create) state = this.createMatch(matchId); return state ?? null; }
  private upsertPlayer(state: MatchState, input: { faceitPlayerId: string; nickname: string; team?: 'A' | 'B' }): MatchPlayer {
    const player = state.players.find((p) => p.faceitPlayerId === input.faceitPlayerId);
    if (player) { player.nickname = input.nickname; if (input.team) player.team = input.team; return player; }
    const created: MatchPlayer = { faceitPlayerId: input.faceitPlayerId, nickname: input.nickname, role: this.defaultRole, team: input.team ?? 'A', alive: true, hp: 100, kills: 0, deaths: 0, assists: 0, weapons: [] };
    state.players.push(created); state.alivePlayers.push(created); return created;
  }
  private bump(state: MatchState, event: GameEvent): void { state.recentEvents = [...state.recentEvents, event].slice(-40); state.stateVersion += 1; state.stateHash = hashMatchState(state); state.timestamp = epochNow(); if (this.learn) this.learn(state, event); if (this.onStateChange) this.onStateChange(state.matchId, state); }
}
