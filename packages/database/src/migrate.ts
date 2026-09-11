/**
 * Migration CLI — `npm run migrate`.
 */
import { getDb, closeDb } from './client';
import { runMigrations } from './migrate-runner';

async function run(): Promise<void> {
  const sql = getDb();
  const applied = await runMigrations(sql);
  if (applied.length === 0) {
    process.stdout.write('[migrate] up to date\n');
  } else {
    for (const name of applied) process.stdout.write(`[migrate] applied ${name}\n`);
    process.stdout.write(`[migrate] done, ${applied.length} applied\n`);
  }
  await closeDb();
}

run().catch((err) => {
  process.stderr.write(`[migrate] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});