/**
 * Minimal typed shapes for the FACEIT Data API (open.faceit.com/data/v4)
 * and the OAuth endpoints (api.faceit.com). Only the fields the product needs
 * are modeled; unknown fields are passed through as `unknown`.
 */

export interface FaceitPlayerCore {
  player_id: string;
  nickname: string;
  avatar?: string;
  country?: string;
  faceit_url?: string;
  games?: {
    cs2?: {
      faceit_elo?: number;
      skill_level?: number;
      game_player_id?: string;
      region?: string;
    };
  };
}

export interface FaceitPlayerSearchItem {
  player_id: string;
  nickname: string;
  avatar?: string;
  country?: string;
  status?: string;
  verified?: boolean;
  games?: Array<{ name?: string; skill_level?: number }>;
}

export interface FaceitPlayerSearchResponse {
  items: FaceitPlayerSearchItem[];
  start?: number;
  end?: number;
}

export interface FaceitMember {
  player_id: string;
  nickname: string;
  avatar?: string;
  skill_level?: number;
  game_player_id?: string;
}

export interface FaceitFaction {
  faction_id: string;
  faction_type?: string;
  team_id?: string;
  nickname?: string;
  avatar?: string;
  leader?: string;
  members: FaceitMember[];
  roster?: FaceitMember[];
}

export interface FaceitMatchResult {
  winner?: string;
  score?: { faction1?: number; faction2?: number };
}

export interface FaceitMatchListItem {
  match_id: string;
  game?: string;
  game_mode?: string;
  region?: string;
  competition_id?: string;
  competition_name?: string;
  organizer_id?: string;
  status?: string;
  started_at?: number;
  finished_at?: number;
  playing_players?: string[];
  teams?: Record<string, FaceitFaction>;
  results?: FaceitMatchResult;
  /** Present only on match detail responses. */
  details?: {
    type?: string;
    map?: string;
    round_states?: unknown[];
    match_state_data?: unknown;
  };
}

export interface FaceitMatchDetail extends FaceitMatchListItem {
  faceit_url?: string;
  chat_room_id?: string;
  configured_at?: number;
  started_at?: number;
  finished_at?: number;
}

export interface FaceitPlayerHistory {
  items: FaceitMatchListItem[];
  start: number;
  end: number;
  from: number;
  to: number;
  items_totals?: number;
}

export interface FaceitCs2Stats {
  lifetime?: {
    'Average Headshots %'?: number;
    'Current Win Streak'?: number;
    games?: number;
    'K/D Ratio'?: number;
    Kills?: number;
    Matches?: number;
    'Longest Win Streak'?: number;
    'Recent Results'?: string[];
    'Total Headshots'?: number;
    Wins?: number;
  };
  segments?: Array<Record<string, unknown>>;
}

export interface FaceitTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
}

export interface FaceitWebhookEvent {
  event: string;
  payload: unknown;
  /** present when FACEIT forwards one */
  event_type?: string;
  ts?: number;
}

export type FaceitMatchEventType =
  | 'match_object_created'
  | 'match_status_configuring'
  | 'match_status_ready'
  | 'match_status_started'
  | 'match_status_finished'
  | 'match_status_aborted'
  | 'match_status_cancelled'
  | 'match_demo_ready';

export interface NormalizedFaceitMatchState {
  faceitMatchId: string;
  status: 'scheduled' | 'configuring' | 'ready' | 'ongoing' | 'finished' | 'aborted' | 'cancelled';
  map?: string;
  teams?: {
    a: { teamId?: string; name?: string; players: FaceitMember[] };
    b: { teamId?: string; name?: string; players: FaceitMember[] };
  };
  score?: { a: number; b: number };
  startedAt?: number;
  finishedAt?: number;
  winnerFactionId?: string;
}