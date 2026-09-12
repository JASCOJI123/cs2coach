import { loadEnv } from '@cs2coach/shared';
import { getDb } from '@cs2coach/database';

async function main() {
  const env = loadEnv();
  const db = getDb(env.databaseUrl);
  try {
    // Begona jadvallarda nima bor?
    for (const t of ['User', 'Match', 'Round', 'Setting']) {
      try {
        const rows = await db.unsafe(`select count(*)::int as n from "${t}"`);
        console.log(t + ':', (rows as any[])[0]?.n, 'qator');
        if ((rows as any[])[0]?.n && (rows as any[])[0]?.n > 0) {
          const sample = await db.unsafe(`select * from "${t}" limit 3`);
          console.log('   ', JSON.stringify(sample).slice(0, 300));
        }
      } catch (e) { console.log(t + ': xatolik', (e as Error).message.slice(0, 80)); }
    }
  } catch (err) {
    console.log('XATO:', (err as Error).message);
  }
  await db.end();
}
main();
