import { loadEnv } from '@cs2coach/shared';
import { getDb, pingDb } from '@cs2coach/database';

async function main() {
  const env = loadEnv();
  console.log('DATABASE_URL oqilgan:', env.databaseUrl ? 'HA' : "YO'Q");
  const db = getDb(env.databaseUrl);
  try {
    const ok = await pingDb(db);
    console.log('DB ping:', ok ? 'OK' : 'FAIL');
    const tables = await db`select table_name from information_schema.tables where table_schema='public' order by table_name`;
    const names = (tables as any[]).map((t) => t.table_name);
    console.log('Tables:', names.length, '->', names.slice(0, 15).join(', '));
    const users = await db`select id, telegram_id, telegram_username, created_at from users limit 20`;
    console.log('Users soni:', users.length);
    for (const u of users as any[]) console.log('  user:', u.telegram_id, u.telegram_username ?? '(no username)', u.created_at);
  } catch (err) {
    console.log('XATO:', (err as Error).message);
  }
  await db.end();
}
main();
