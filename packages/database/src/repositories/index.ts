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
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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

/**
 * Relink a FACEIT identity safely when an old test/account row already owns
 * the same unique faceit_user_id. The delete + insert happen in one DB
 * transaction, so the unique constraint cannot race the application logic.
 */
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
