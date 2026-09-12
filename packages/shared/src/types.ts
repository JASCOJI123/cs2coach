/**
 * Core domain model for the CS2 AI Coach.
 * Every engine and the Mini App operate on these types.
 */
import type { ActionType, AiStatus, BuyType, Confidence, MatchStatus, PlayerRole, VetoStep } from './constants';

export interface FaceitPlayerRef { faceitPlayerId: string; nickname: string; avatar?: string; country?: string; skillLevel?: number; elo?: number; }
export interface FaceitTeamRef { teamId?: string; name?: string; players: FaceitPlayerRef[]; }
export interface MatchNameEvent { matchId: string; ts: number; }
export interface TeamScoreEvent extends MatchNameEvent { scoreA: number; scoreB: number; }

export type GameEvent =
  | ({ type: 'match_created' } & MatchNameEvent)
  | ({ type: 'match_started'; map?: string; teams?: { a?: FaceitTeamRef; b?: FaceitTeamRef } } & MatchNameEvent)
  | ({ type: 'match_status_ready' } & MatchNameEvent)
  | ({ type: 'match_status_finished'; winnerFactionId?: string } & MatchNameEvent)
  | ({ type: 'match_status_aborted' } & MatchNameEvent)
  | ({ type: 'match_status_cancelled' } & MatchNameEvent)
  | ({ type: 'match_demo_ready'; demoUrl?: string } & MatchNameEvent)
  | ({ type: 'round_started'; round: number; side?: 'CT' | 'T' } & MatchNameEvent)
  | ({ type: 'round_ended'; round: number; winner?: 'CT' | 'T' | string; reason?: string; economy?: { a: TeamEconomy; b: TeamEconomy } } & MatchNameEvent)
  | ({ type: 'score_updated' } & TeamScoreEvent)
  | ({ type: 'player_connect'; player: FaceitPlayerRef; team: 'A' | 'B' } & MatchNameEvent)
  | ({ type: 'player_state_updated'; player: FaceitPlayerRef; team: 'A' | 'B'; alive: boolean; hp?: number; kills?: number; deaths?: number; assists?: number; weapons?: string[]; money?: number; position?: { x: number; y: number; z: number } } & MatchNameEvent)
  | ({ type: 'player_kill'; round: number; killer: FaceitPlayerRef; victim: FaceitPlayerRef; weapon?: string; headshot?: boolean; site?: 'A' | 'B' } & MatchNameEvent)
  | ({ type: 'veto_updated'; veto: VetoStep[]; map?: string; teams?: { a?: FaceitTeamRef; b?: FaceitTeamRef } } & MatchNameEvent)
  | ({ type: 'map_selected'; map: string } & MatchNameEvent)
  | ({ type: 'bomb_state'; planted: boolean; site?: 'A' | 'B'; defused?: boolean } & MatchNameEvent)
  | ({ type: 'demo_mode'; note?: string } & MatchNameEvent);

export type EventStream = readonly GameEvent[];
export interface TeamEconomy { money: number; armor: boolean; weapons: string[]; utility: string[]; lossBonus: number; buyType: BuyType; }
export interface EconomyState { a: TeamEconomy; b: TeamEconomy; }
export interface MatchPlayer { faceitPlayerId: string; nickname: string; role: PlayerRole; team: 'A' | 'B'; alive: boolean; hp: number; kills: number; deaths: number; assists: number; weapons: string[]; headshotPct?: number; }
export interface PositionSample { x: number; y: number; z: number; area?: string; ts: number; }
export interface BombsiteInfo { planted: boolean; site?: 'A' | 'B'; defused?: boolean; }
export interface RoundResult { round: number; winner?: 'CT' | 'T' | string; winReason?: string; kills: number; deaths: number; openingDuel?: { killer?: string; victim?: string }; bomb: { planted: boolean; site?: 'A' | 'B'; defused: boolean }; economyAtStart?: { a: TeamEconomy; b: TeamEconomy }; executedAction?: ActionType; }
export interface OpponentPattern { playerId?: string; player?: FaceitPlayerRef; patternType: 'position' | 'site' | 'aggression' | 'utility' | 'rotation' | 'clutch' | 'execute'; location: string; frequency: number; confidence: Confidence; sampleSize: number; updatedAt: number; }
export interface TeamPattern { type: string; summary: string; confidence: Confidence; sampleSize: number; }

export interface MatchState {
  matchId: string; map?: string; status: MatchStatus; phase: 'pre_match' | 'live' | 'post_match'; score: { a: number; b: number }; round: number; side?: 'CT' | 'T';
  players: MatchPlayer[]; alivePlayers: MatchPlayer[]; economy?: EconomyState; bomb: BombsiteInfo; positions: Record<string, PositionSample[]>;
  mapControl?: { a?: number; b?: number; mid?: number }; recentEvents: GameEvent[]; previousRounds: RoundResult[]; opponentPatterns: OpponentPattern[]; teamPatterns: TeamPattern[]; veto: VetoStep | VetoStep[] | null;
  teams?: { a?: FaceitTeamRef; b?: FaceitTeamRef }; stateVersion: number; stateHash: string; timestamp: number; gameDataAvailable: boolean; aiStatus: AiStatus; demoMode: boolean;
}

export interface PlayerInstruction { player: FaceitPlayerRef; role: PlayerRole; action: string; timing?: string; utility?: string; target?: string; fallback?: string; warning?: string; }
export interface Recommendation { priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; action: ActionType; location?: string; timing?: string; utility?: string; confidence: number; reason: string; warning?: string; role?: PlayerRole; playerInstructions: PlayerInstruction[]; source: 'groq' | 'tactical-engine'; generatedAt: number; }
export interface PreMatchAnalysis { matchId: string; map?: string; winProbability?: { a: number; b: number; confidence: Confidence }; teamStrengths: { team: 'A' | 'B'; items: string[] }[]; teamWeaknesses: { team: 'A' | 'B'; items: string[] }[]; playerRoles: { playerId: string; nickname: string; role: PlayerRole }[]; mapAnalysis: string[]; tacticalPlan: string[]; opponentThreats: string[]; insufficientData: boolean; source: 'groq' | 'tactical-engine'; generatedAt: number; }
export interface PerformanceMetric { name: string; score: number; comment: string; }
export interface TrainingDay { day: number; focus: string; drills: string[]; }
export interface TrainingPlan { summary: string; days: TrainingDay[]; }
export interface PostMatchAnalysis { matchId: string; finalScore: { a: number; b: number }; overallScore: number; metrics: PerformanceMetric[]; bestRound?: RoundResult; worstRound?: RoundResult; topMistakes: string[]; topDecisions: string[]; opponentPatterns: OpponentPattern[]; trainingPlan: TrainingPlan; source: 'groq' | 'tactical-engine'; generatedAt: number; }
export interface MatchSummary { matchId: string; status: MatchStatus; teams?: { a?: FaceitTeamRef; b?: FaceitTeamRef }; map?: string; score?: { a: number; b: number }; startedAt?: string; finishedAt?: string; aiStatus: AiStatus; gameDataAvailable: boolean; updatedAt: string; }

export function emptyMatchState(matchId: string): MatchState {
  return { matchId, status: 'ready', phase: 'pre_match', score: { a: 0, b: 0 }, round: 0, players: [], alivePlayers: [], bomb: { planted: false }, positions: {}, opponentPatterns: [], teamPatterns: [], veto: null, recentEvents: [], previousRounds: [], stateVersion: 0, stateHash: '', timestamp: Date.now(), gameDataAvailable: false, aiStatus: 'READY', demoMode: false };
}
