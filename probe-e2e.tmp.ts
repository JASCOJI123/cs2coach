/* Temporary e2e probe — NOT committed. Builds a REAL Telegram initData
   (correct HMAC hash from the real bot token in .env), logs in against the
   deployed Render API, then calls a protected route with the issued JWT
   to prove session verification works. */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(resolve(file), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !m[1].startsWith('#')) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

async function main(): Promise<void> {
  const env = loadEnv('.env');
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  if (!token) {
    console.error('NO TELEGRAM_BOT_TOKEN in .env');
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const user = { id: 7080911448, first_name: 'Jasco', username: 'jasco_probe', language_code: 'en' };
  const params: Record<string, string> = {
    auth_date: String(now),
    query_id: `AAH${Math.random().toString(36).slice(2, 12)}`,
    user: JSON.stringify(user),
  };

  const dataCheckString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const initData = new URLSearchParams(params).toString();

  const API = 'https://cs2coach-api.onrender.com';
  console.log('initData keys:', [...new URLSearchParams(initData).keys()].join(','));

  const res = await fetch(`${API}/api/auth/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  console.log('login status:', res.status);
  const body = (await res.json()) as { ok?: boolean; code?: string; message?: string; data?: { token?: string; user?: unknown; demoMode?: boolean } };
  console.log('login body:', JSON.stringify(body).slice(0, 300));

  const jwt = body.data?.token;
  if (!jwt) {
    console.log('NO TOKEN — login did not succeed');
    process.exit(2);
  }
  console.log('JWT issued:', jwt.slice(0, 24), '…');

  const protectedRes = await fetch(`${API}/api/auth/faceit/status`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  console.log('faceit/status:', protectedRes.status, (await protectedRes.text()).slice(0, 200));

  const connectRes = await fetch(`${API}/api/auth/faceit`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const connectText = (await connectRes.text()).slice(0, 400);
  console.log('faceit/connect:', connectRes.status, connectText);

  // Follow the actual OAuth return path: hit the callback with the state from
  // the connect route and a BOGUS code. This exercises the real FACEIT token
  // endpoint + real client_secret, and shows the exact error our server throws
  // when the code is bad — which tells us if the exchange config is correct.
  let state = '';
  try {
    state = (JSON.parse(connectText).data as { url: string }).url.split('state=')[1].split('&')[0];
  } catch {
    state = 'probe-' + Math.random().toString(36).slice(2, 8);
  }
  const cbRes = await fetch(`${API}/api/auth/faceit/callback?state=${encodeURIComponent(state)}&code=PROBE_BOGUS_CODE`);
  const cbText = (await cbRes.text()).slice(0, 500);
  console.log('faceit/callback bogus-code:', cbRes.status, cbText);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});