/**
 * Pruned client-side types — mirrors the API response envelopes and the
 * WebSocket `match_state` payload. The web bundle must NOT import backend
 * packages (they pull in node:crypto / dotenv).
 */

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResult {
  token: string;
  expiresAt: number;
  user: { id: string; firstName?: string; username?: string };
  demoMode: boolean;
}

export interface FaceitStatus {
  connected: boolean;
  nickname?: string;
  faceitUserId?: string;
  avatar?: string | null;
  country?: string | null;
  skillLevel?: number | null;
  elo?: number | null;
}

export interface MatchLite {
  id: string;
  faceitMatchId: string;
  map: string | null;
  status: string;
  score: { a: number; b: number };
  startedAt: string | null;
  finishedAt: string | null;
}

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface OpponentPatternLite {
  id: string;
  location: string;
  confidence: Confidence;
  sampleSize: number;
  frequency: number;
  players?: { faceitPlayerId: string; nickname: string; appearances: number }[];
}

export interface TeamEconomyLite {
  money: number;
  weapons: string[];
  utility: string[];
  buyType: string;
}

export interface MatchPlayerLite {
  faceitPlayerId: string;
  nickname: string;
  role: string;
  team: 'A' | 'B';
  alive: boolean;
  hp: number;
  kills: number;
  deaths: number;
  assists: number;
  weapons: string[];
}

export interface RoundResultLite {
  round: number;
  winner?: string;
  winReason?: string;
  kills: number;
  deaths: number;
  openingDuel?: { killer: string; victim: string };
  bomb?: { planted: boolean; site?: string; defused: boolean };
}

export interface MatchStateLite {
  matchId: string;
  status: string;
  phase: string;
  map: string | null;
  round: number;
  side?: 'CT' | 'T';
  score: { a: number; b: number };
  players: MatchPlayerLite[];
  alivePlayers: MatchPlayerLite[];
  bomb: { planted: boolean; site?: string; defused?: boolean };
  economy?: { a: TeamEconomyLite; b: TeamEconomyLite };
  previousRounds: RoundResultLite[];
  opponentPatterns: OpponentPatternLite[];
  aiStatus: string;
  gameDataAvailable: boolean;
  demoMode: boolean;
  stateVersion: number;
  stateHash: string;
  timestamp: number;
}

export interface RecommendationLite {
  action: string;
  detail: string;
  priority: number;
  confidence: Confidence;
  expiresAt?: number | null;
}

export interface PlayerInstructionLite {
  faceitPlayerId: string;
  nickname: string;
  role: string;
  instruction: string;
}

export interface TacticalDecisionLite {
  deterministic: boolean;
  recommendation: RecommendationLite;
  instructions: PlayerInstructionLite[];
  signals: { label: string; detail: string }[];
}

export interface WsMessage {
  type: 'match_state' | 'ai_decision' | 'ping';
  matchId?: string;
  state?: MatchStateLite;
  decision?: TacticalDecisionLite;
  ts?: number;
}
