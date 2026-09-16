/**
 * Reusable migration runner. Applies pending `*.sql` files sequentially inside
 * transactions and records them in `schema_migrations`. Used by the CLI
 * (`migrate.ts`) and by the API on startup in dev.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Sql } from 'postgres';

/**
 * tsc does not copy .sql files into dist/. In production, the compiled module
 * lives in packages/database/dist, while SQL migrations remain in src/migrations.
 * Resolve from the module location first, then from the repository root.
 */
function resolveMigrationsDir(): string {
  const override = process.env.MIGRATIONS_DIR;
  if (override) return override;
  const candidates = [
    join(__dirname, 'migrations'),
    join(__dirname, '..', 'src', 'migrations'),
    join(process.cwd(), 'packages', 'database', 'src', 'migrations'),
    join(process.cwd(), '..', '..', 'packages', 'database', 'src', 'migrations'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, '001_init.sql'))) return candidate;
  }
  return candidates[0];
}

export async function runMigrations(sql: Sql, dir?: string): Promise<string[]> {
  const migrationsDir = dir ?? resolveMigrationsDir();
  await sql`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const appliedRows = await sql<{ name: string }[]>`select name from schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.name));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const content = readFileSync(join(migrationsDir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    appliedNow.push(file);
  }
  return appliedNow;
}