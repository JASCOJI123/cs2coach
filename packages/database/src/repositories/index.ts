/**
 * Repository layer (spec §69 clean architecture).
 * All persistence goes through these functions — route handlers never write SQL.
 * Rows are returned with camelCase fields (postgres.js camel transform).
 */
import type { Sql } from 'postgres';
import type { BuyType, MatchStatus } from '@cs2coach/shared';

// ── row shapes ───────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  telegramId: number;
  telegramUsername: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FaceitAccountRow {
  id: string;
  userId: string;
  faceitUserId: string;
  nickname: string;
  avatar: string | null;
  country: string | null;
  skillLevel: number | null;
  elo: number | null;
  accessToken: string | null; // AES-encrypted at rest (see shared/crypto)
  refreshToken: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlayerRow {
  id: string;
  faceitPlayerId: string;
  nickname: string;
  country: string | null;
  avatar: string | null;
  skillLevel: number | null;
  elo: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamRow {
  id: string;
  faceitTeamId: string | null;
  name: string;
  createdAt: Date;
}

export interface MatchRow {
  id: string;
  faceitMatchId: string;
  game: string;
  competition: string | null;
  map: string | null;
  status: MatchStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number;
  scoreB: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoundRow {
  id: string;
  matchId: string;
  roundNumber: number;
  winner: string | null;
  side: string | null;
  winReason: string | null;
  scoreAfterRound: string | null;
  createdAt: Date;
}

export interface RecommendationRow {
  id: string;
  matchId: string;
  roundId: string | null;
  playerId: string | null;
  recommendationType: string;
  action: string;
  location: string | null;
  timing: string | null;
  confidence: number;
  reasoning: string | null;
  createdAt: Date;
}

// ── users ───────────────────────────────────────────────────────────────────

export async function upsertUser(
  sql: Sql,
  input: { telegramId: number; username?: string | null },
): Promise<UserRow> {
  const [row] = await sql<UserRow[]>`
    insert into users (telegram_id, telegram_username)
    values (${input.telegramId}, ${input.username ?? null})
    on conflict (telegram_id)
    do update set
      telegram_username = coalesce(excluded.telegram_username, users.telegram_username),
      updated_at = now()
    returning id, telegram_id, telegram_username, created_at, updated_at
  `;
  return row;
}

export async function findUserByTelegramId(sql: Sql, telegramId: number): Promise<UserRow | null> {
  const [row] = await sql<UserRow[]>`select id, telegram_id, telegram_username, created_at, updated_at
    from users where telegram_id = ${telegramId}`;
  return row ?? null;
}

export async function findUserById(sql: Sql, userId: string): Promise<UserRow | null> {
  const [row] = await sql<UserRow[]>`select id, telegram_id, telegram_username, created_at, updated_at
    from users where id = ${userId}`;
  return row ?? null;
}

// ── faceit_accounts ─────────────────────────────────────────────────────────

export interface UpsertFaceitAccountInput {
  userId: string;
  faceitUserId: string;
  nickname: string;
  avatar?: string | null;
  country?: string | null;
  skillLevel?: number | null;
  elo?: number | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAtMs?: number | null;
}

export async function upsertFaceitAccountByUser(
  sql: Sql,
  input: UpsertFaceitAccountInput,
): Promise<FaceitAccountRow> {
  const [row] = await sql<FaceitAccountRow[]>`
    insert into faceit_accounts (
      user_id, faceit_user_id, nickname, avatar, country, skill_level, elo,
      access_token, refresh_token, expires_at
    ) values (
      ${input.userId}, ${input.faceitUserId}, ${input.nickname}, ${input.avatar ?? null},
      ${input.country ?? null}, ${input.skillLevel ?? null}, ${input.elo ?? null},
      ${input.accessToken ?? null}, ${input.refreshToken ?? null},
      ${input.expiresAtMs ? new Date(input.expiresAtMs) : null}
    )
    on conflict (user_id)
    do update set
      faceit_user_id = excluded.faceit_user_id,
      nickname = excluded.nickname,
      avatar = excluded.avatar,
      country = excluded.country,
      skill_level = excluded.skill_level,
      elo = excluded.elo,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = now()
    returning id, user_id, faceit_user_id, nickname, avatar, country, skill_level, elo,
      access_token, refresh_token, expires_at, created_at, updated_at
  `;
  return row;
}

/** Atomically replaces any existing link for this Telegram user or FACEIT id. */
export async function relinkFaceitAccount(
  sql: Sql,
  input: UpsertFaceitAccountInput,
): Promise<FaceitAccountRow> {
  return sql.begin(async (tx) => {
    await tx`
      delete from faceit_accounts
      where user_id = ${input.userId}
         or faceit_user_id = ${input.faceitUserId}
    `;

    const [row] = await tx<FaceitAccountRow[]>`
      insert into faceit_accounts (
        user_id, faceit_user_id, nickname, avatar, country, skill_level, elo,
        access_token, refresh_token, expires_at
      ) values (
        ${input.userId}, ${input.faceitUserId}, ${input.nickname}, ${input.avatar ?? null},
        ${input.country ?? null}, ${input.skillLevel ?? null}, ${input.elo ?? null},
        ${input.accessToken ?? null}, ${input.refreshToken ?? null},
        ${input.expiresAtMs ? new Date(input.expiresAtMs) : null}
      )
      returning id, user_id, faceit_user_id, nickname, avatar, country, skill_level, elo,
        access_token, refresh_token, expires_at, created_at, updated_at
    `;
    return row;
  });
}

export async function findFaceitAccountByUserId(sql: Sql, userId: string): Promise<FaceitAccountRow | null> {
  const [row] = await sql<FaceitAccountRow[]>`
    select id, user_id, faceit_user_id, nickname, avatar, country, skill_level, elo,
      access_token, refresh_token, expires_at, created_at, updated_at
    from faceit_accounts where user_id = ${userId}
  `;
  return row ?? null;
}

export async function findFaceitAccountByFaceitUserId(sql: Sql, faceitUserId: string): Promise<FaceitAccountRow | null> {
  const [row] = await sql<FaceitAccountRow[]>`
    select id, user_id, faceit_user_id, nickname, avatar, country, skill_level, elo,
      access_token, refresh_token, expires_at, created_at, updated_at
    from faceit_accounts where faceit_user_id = ${faceitUserId}
  `;
  return row ?? null;
}

export async function deleteFaceitAccount(sql: Sql, userId: string): Promise<void> {
  await sql`delete from faceit_accounts where user_id = ${userId}`;
}

// ── players & teams ─────────────────────────────────────────────────────────

export async function upsertPlayer(
  sql: Sql,
  input: {
    faceitPlayerId: string;
    nickname: string;
    country?: string | null;
    avatar?: string | null;
    skillLevel?: number | null;
    elo?: number | null;
  },
): Promise<PlayerRow> {
  const [row] = await sql<PlayerRow[]>`
    insert into players (faceit_player_id, nickname, country, avatar, skill_level, elo)
    values (${input.faceitPlayerId}, ${input.nickname}, ${input.country ?? null},
      ${input.avatar ?? null}, ${input.skillLevel ?? null}, ${input.elo ?? null})
    on conflict (faceit_player_id) do update set
      nickname = excluded.nickname,
      country = excluded.country,
      avatar = excluded.avatar,
      skill_level = excluded.skill_level,
      elo = excluded.elo,
      updated_at = now()
    returning id, faceit_player_id, nickname, country, avatar, skill_level, elo, created_at, updated_at
  `;
  return row;
}

export async function upsertTeam(
  sql: Sql,
  input: { faceitTeamId?: string | null; name: string },
): Promise<TeamRow> {
  const [row] = await sql<TeamRow[]>`
    insert into teams (faceit_team_id, name)
    values (${input.faceitTeamId ?? null}, ${input.name})
    on conflict (faceit_team_id) do update set name = excluded.name, updated_at = now()
    returning id, faceit_team_id, name, created_at
  `;
  return row;
}

// ── matches ─────────────────────────────────────────────────────────────────

export interface UpsertMatchInput {
  faceitMatchId: string;
  game?: string;
  competition?: string | null;
  map?: string | null;
  status: MatchStatus;
  startedAtMs?: number | null;
  finishedAtMs?: number | null;
  teamAId?: string | null;
  teamBId?: string | null;
  scoreA?: number;
  scoreB?: number;
}

export async function upsertMatchFromFaceit(sql: Sql, input: UpsertMatchInput): Promise<MatchRow> {
  const [row] = await sql<MatchRow[]>`
    insert into matches (
      faceit_match_id, game, competition, map, status,
      started_at, finished_at, team_a_id, team_b_id, score_a, score_b
    ) values (
      ${input.faceitMatchId}, ${input.game ?? 'cs2'}, ${input.competition ?? null},
      ${input.map ?? null}, ${input.status},
      ${input.startedAtMs ? new Date(input.startedAtMs) : null},
      ${input.finishedAtMs ? new Date(input.finishedAtMs) : null},
      ${input.teamAId ?? null}, ${input.teamBId ?? null},
      ${input.scoreA ?? 0}, ${input.scoreB ?? 0}
    )
    on conflict (faceit_match_id) do update set
      game = excluded.game,
      competition = excluded.competition,
      map = coalesce(excluded.map, matches.map),
      status = excluded.status,
      started_at = coalesce(excluded.started_at, matches.started_at),
      finished_at = coalesce(excluded.finished_at, matches.finished_at),
      team_a_id = coalesce(excluded.team_a_id, matches.team_a_id),
      team_b_id = coalesce(excluded.team_b_id, matches.team_b_id),
      score_a = coalesce(excluded.score_a, matches.score_a),
      score_b = coalesce(excluded.score_b, matches.score_b),
      updated_at = now()
    returning id, faceit_match_id, game, competition, map, status, started_at, finished_at,
      team_a_id, team_b_id, score_a, score_b, created_at, updated_at
  `;
  return row;
}

export async function getMatchByFaceitId(sql: Sql, faceitMatchId: string): Promise<MatchRow | null> {
  const [row] = await sql<MatchRow[]>`
    select id, faceit_match_id, game, competition, map, status, started_at, finished_at,
      team_a_id, team_b_id, score_a, score_b, created_at, updated_at
    from matches where faceit_match_id = ${faceitMatchId}
  `;
  return row ?? null;
}

export async function getMatchById(sql: Sql, matchId: string): Promise<MatchRow | null> {
  const [row] = await sql<MatchRow[]>`
    select id, faceit_match_id, game, competition, map, status, started_at, finished_at,
      team_a_id, team_b_id, score_a, score_b, created_at, updated_at
    from matches where id = ${matchId}
  `;
  return row ?? null;
}

export async function updateMatchStatus(
  sql: Sql,
  input: {
    matchId: string;
    status?: MatchStatus;
    map?: string | null;
    scoreA?: number;
    scoreB?: number;
    finishedAtMs?: number | null;
  },
): Promise<void> {
  await sql`
    update matches set
      status = coalesce(${input.status ?? null}, status),
      map = coalesce(${input.map ?? null}, map),
      score_a = coalesce(${input.scoreA ?? null}, score_a),
      score_b = coalesce(${input.scoreB ?? null}, score_b),
      finished_at = coalesce(${input.finishedAtMs ? new Date(input.finishedAtMs) : null}, finished_at),
      updated_at = now()
    where id = ${input.matchId}
  `;
}

export async function listMatchesForUser(
  sql: Sql,
  input: { userId: string; limit?: number },
): Promise<MatchRow[]> {
  const limit = input.limit ?? 30;
  return sql<MatchRow[]>`
    select distinct m.id, m.faceit_match_id, m.game, m.competition, m.map, m.status,
      m.started_at, m.finished_at, m.team_a_id, m.team_b_id, m.score_a, m.score_b,
      m.created_at, m.updated_at
    from matches m
    join match_players mp on mp.match_id = m.id
    join players p on p.id = mp.player_id
    join faceit_accounts fa on fa.faceit_user_id = p.faceit_player_id
    where fa.user_id = ${input.userId}
    order by m.created_at desc
    limit ${limit}
  `;
}

export async function addMatchPlayer(
  sql: Sql,
  input: { matchId: string; playerId: string; team: 'A' | 'B'; role?: MatchStatus | string | null },
): Promise<void> {
  await sql`
    insert into match_players (match_id, player_id, team, role)
    values (${input.matchId}, ${input.playerId}, ${input.team}, ${input.role ?? null})
    on conflict (match_id, player_id) do update set team = excluded.team, role = excluded.role
  `;
}

// ── rounds ──────────────────────────────────────────────────────────────────

export async function insertRound(
  sql: Sql,
  input: {
    matchId: string;
    roundNumber: number;
    winner?: string | null;
    side?: string | null;
    winReason?: string | null;
    scoreAfterRound?: string | null;
  },
): Promise<RoundRow> {
  const [row] = await sql<RoundRow[]>`
    insert into rounds (match_id, round_number, winner, side, win_reason, score_after_round)
    values (${input.matchId}, ${input.roundNumber}, ${input.winner ?? null},
      ${input.side ?? null}, ${input.winReason ?? null}, ${input.scoreAfterRound ?? null})
    on conflict (match_id, round_number)
    do update set winner = coalesce(excluded.winner, rounds.winner),
      win_reason = coalesce(excluded.win_reason, rounds.win_reason),
      score_after_round = coalesce(excluded.score_after_round, rounds.score_after_round)
    returning id, match_id, round_number, winner, side, win_reason, score_after_round, created_at
  `;
  return row;
}

export async function listRoundsByMatch(sql: Sql, matchId: string): Promise<RoundRow[]> {
  return sql<RoundRow[]>`select id, match_id, round_number, winner, side, win_reason,
    score_after_round, created_at from rounds where match_id = ${matchId} order by round_number asc`;
}

// ── recommendations ─────────────────────────────────────────────────────────

export interface InsertRecommendationInput {
  matchId: string;
  roundId?: string | null;
  playerId?: string | null;
  recommendationType: string;
  action: string;
  location?: string | null;
  timing?: string | null;
  confidence: number;
  reasoning?: string | null;
}

export async function insertRecommendation(
  sql: Sql,
  input: InsertRecommendationInput,
): Promise<RecommendationRow> {
  const [row] = await sql<RecommendationRow[]>`
    insert into ai_recommendations (
      match_id, round_id, player_id, recommendation_type, action,
      location, timing, confidence, reasoning
    ) values (
      ${input.matchId}, ${input.roundId ?? null}, ${input.playerId ?? null},
      ${input.recommendationType}, ${input.action},
      ${input.location ?? null}, ${input.timing ?? null}, ${input.confidence},
      ${input.reasoning ?? null}
    )
    returning id, match_id, round_id, player_id, recommendation_type, action,
      location, timing, confidence, reasoning, created_at
  `;
  return row;
}

export async function listRecommendationsByMatch(
  sql: Sql,
  matchId: string,
  limit = 50,
): Promise<RecommendationRow[]> {
  return sql<RecommendationRow[]>`select id, match_id, round_id, player_id, recommendation_type,
    action, location, timing, confidence, reasoning, created_at
    from ai_recommendations where match_id = ${matchId} order by created_at desc limit ${limit}`;
}

// ── analysis & training plans ───────────────────────────────────────────────

export async function upsertMatchAnalysis(
  sql: Sql,
  input: { matchId: string; pre?: unknown | null; live?: unknown | null; post?: unknown | null },
): Promise<void> {
  await sql`
    insert into match_analysis (match_id, pre_match_analysis, live_analysis, post_match_analysis)
    values (${input.matchId}, ${input.pre ? JSON.stringify(input.pre) : null},
      ${input.live ? JSON.stringify(input.live) : null},
      ${input.post ? JSON.stringify(input.post) : null})
    on conflict (match_id) do update set
      pre_match_analysis = coalesce(${input.pre ? JSON.stringify(input.pre) : null}, match_analysis.pre_match_analysis),
      live_analysis = coalesce(${input.live ? JSON.stringify(input.live) : null}, match_analysis.live_analysis),
      post_match_analysis = coalesce(${input.post ? JSON.stringify(input.post) : null}, match_analysis.post_match_analysis),
      updated_at = now()
  `;
}

export async function getMatchAnalysis(
  sql: Sql,
  matchId: string,
): Promise<{ preMatchAnalysis: unknown | null; liveAnalysis: unknown | null; postMatchAnalysis: unknown | null } | null> {
  const [row] = await sql<any[]>`
    select pre_match_analysis, live_analysis, post_match_analysis
    from match_analysis where match_id = ${matchId}
  `;
  if (!row) return null;
  return {
    preMatchAnalysis: row.preMatchAnalysis,
    liveAnalysis: row.liveAnalysis,
    postMatchAnalysis: row.postMatchAnalysis,
  };
}

export async function upsertTrainingPlan(
  sql: Sql,
  input: { userId: string; matchId?: string | null; planJson: unknown },
): Promise<void> {
  await sql`
    insert into training_plans (user_id, match_id, plan_json)
    values (${input.userId}, ${input.matchId ?? null}, ${JSON.stringify(input.planJson)})
  `;
}

export type { BuyType };
