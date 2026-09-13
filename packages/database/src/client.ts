/**
 * Postgres client factory backed by the `postgres` (porsager) driver.
 * Render filesystem is ephemeral, so ALL state lives in Neon PostgreSQL.
 * Uses a small connection pool; connection pooling is required for free tiers.
 */
import postgres, { type Sql } from 'postgres';
import { AppError } from '@cs2coach/shared';

let db: Sql | undefined;

export interface DbOptions {
  max?: number;
  ssl?: boolean | 'require' | 'prefer';
}

export function getDb(url?: string, opts?: DbOptions): Sql {
  if (db) return db;
  const databaseUrl = url ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new AppError('MISSING_ENV', 'DATABASE_URL is not set', 500);
  }
  const wantsRequireSsl = databaseUrl.includes('sslmode=require') || databaseUrl.includes('sslmode=verify-full');
  db = postgres(databaseUrl, {
    max: opts?.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    prepare: true,
    ssl: opts?.ssl ?? (wantsRequireSsl ? 'require' : 'prefer'),
    transform: postgres.camel,
    onnotice: () => {
      /* suppress notice noise in logs */
    },
  });
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.end({ timeout: 5 });
    db = undefined;
  }
}

export async function pingDb(sql: Sql): Promise<boolean> {
  try {
    const [{ ok }] = await sql`select true as ok`;
    return ok === true;
  } catch {
    return false;
  }
}

export type { Sql };