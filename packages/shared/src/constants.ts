/**
 * CS2 tactical domain constants shared by backend engines and the Mini App.
 */

export const ROLES = ['ENTRY', 'AWPER', 'LURKER', 'SUPPORT', 'IGL', 'RIFLER', 'ANCHOR'] as const;
export type PlayerRole = (typeof ROLES)[number];

export const ACTIONS = [
  'DEFAULT',
  'A_EXECUTE',
  'B_EXECUTE',
  'MID_CONTROL',
  'FAST_A',
  'FAST_B',
  'SPLIT_A',
  'SPLIT_B',
  'ANTI_ECO',
  'FORCE',
  'SAVE',
  'RETREAT',
] as const;
export type ActionType = (typeof ACTIONS)[number];

export const MATCH_STATUSES = ['scheduled', 'configuring', 'ready', 'ongoing', 'finished', 'aborted', 'cancelled'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const AI_STATUSES = [
  'ANALYZING',
  'READY',
  'LIVE',
  'WAITING_FOR_DATA',
  'RECONNECTING',
  'OFFLINE',
  'ERROR',
] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

export const BUY_TYPES = ['FULL_BUY', 'FORCE_BUY', 'HALF_BUY', 'ECO', 'ANTI_ECO', 'LOW_BUY', 'SAVE'] as const;
export type BuyType = (typeof BUY_TYPES)[number];

export const EVENT_TYPES = [
  'match_created',
  'match_started',
  'match_status_ready',
  'match_status_finished',
  'match_status_aborted',
  'match_status_cancelled',
  'match_demo_ready',
  'round_started',
  'round_ended',
  'score_updated',
  'player_connect',
  'player_kill',
  'veto_updated',
  'map_selected',
  'bomb_state',
  'demo_mode',
] as const;
export type GameEventType = (typeof EVENT_TYPES)[number];

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

/** Map a 0..1 confidence score to a coarse label. Never fake precision. */
export function confidenceFromScore(score: number): Confidence {
  if (score < 0.4) return 'LOW';
  if (score < 0.7) return 'MEDIUM';
  return 'HIGH';
}

export const AI_PRIORITY = {
  liveRound: 1,
  roundAnalysis: 2,
  preMatch: 3,
  postMatch: 4,
  background: 5,
} as const;

export const CS2_MAP_POOL = [
  'Mirage',
  'Inferno',
  'Nuke',
  'Overpass',
  'Ancient',
  'Anubis',
  'Vertigo',
  'Dust2',
  'Train',
  'Cache',
] as const;

export interface VetoStep {
  team: 'A' | 'B';
  action: 'BAN' | 'PICK' | 'DECIDER';
  map?: string;
  ts: number;
}