import { loadEnv } from '@cs2coach/shared';
import { getDb } from '@cs2coach/database';

async function main() {
  const env = loadEnv();
  const db = getDb(env.databaseUrl);
  try {
    const tables = await db`select table_name from information_schema.tables where table_schema='public' order by table_name`;
    const names = (tables as any[]).map((t) => t.table_name);
    console.log('HAMMA jadvallar (' + names.length + '):');
    for (const n of names) console.log(' -', n);
    console.log('');
    console.log('users idagi telegram_id lar:');
    const users = await db`select telegram_id, telegram_username from users`;
    for (const u of users as any[]) console.log('  tid:', u.telegram_id, '/', u.telegram_username);
    console.log('schema_migrations:');
    const migs = await db`select name from schema_migrations`;
    for (const m of migs as any[]) console.log('  applied:', m.name);
  } catch (err) {
    console.log('XATO:', (err as Error).message);
  }
  await db.end();
}
main();
