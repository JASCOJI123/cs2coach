# CS2 AI COACH

A real, deployable **Telegram Mini App** that connects a player's FACEIT account
to a live CS2 tactical coach. It detects when a tracked match is live, streams
game events, runs the state through a deterministic tactical engine **and** Groq
AI, and pushes tactical calls to your phone — while **never fabricating game
data** (see [Data policy](#data-policy)).

Built to the spec in [`docs/SPECIFICATION.txt`](docs/SPECIFICATION.txt) (73
rules, §71 build-audit order, §72 build-check, §12 no-fake-data).

---

## Stack (all free tier)

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite (apps/web) |
| API | Node.js + Fastify (apps/api) |
| DB | Neon PostgreSQL (free) — `packages/database` |
| AI | Groq (free) with deterministic fallback (`packages/ai`) |
| Tactics | Rules engine `packages/tactical-engine` (always available, no AI key needed) |
| FACEIT | Data API v4 + OAuth (apps/api ↔ `packages/faceit`) |
| Bot | grammY Telegram bot (`bot/`) |
| Hosting | GitHub + Render Free + UptimeRobot |

## Monorepo layout

```
apps/
  api/    Fastify server (auth, matches, game-state, demo, WebSocket)
  web/    Telegram Mini App (React)
bot/      grammY bot — /start .. /coach, deep-links to the Mini App
packages/
  shared/  canonical types, env, errors, crypto, state-hash
  database/ postgres driver, schema, repositories, migrations
  faceit/  Data API client, OAuth, webhook normalize → GameEvents
  game-state/ providers (FACEIT poll / demo), EventBus, MatchStateEngine,
               RoundEngine, EconomyEngine, StatisticsEngine, OpponentModel
  tactical-engine/ deterministic fallback tactics (no AI required)
  ai/      Groq client, zod validator, AiCoordinator (queue + cooldown + dedup)
docs/     SPECIFICATION.txt (+ archived prior draft)
render.yaml  Render blueprint for API/bot/frontend
```

## Quick start

Requirements: Node 20+, a Neon (or any postgres) connection string.

```bash
npm ci
cp .env.example .env   # fill real values
npm run migrate        # create tables (packages/database schema migrations)
npm run dev:api        # API on :8080
npm run dev:bot        # Telegram bot (long polling — works on Render Free)
npm run dev:web        # Mini App on :5173
```

Then:

1. In Telegram, message your bot `/start` → **OPEN AI COACH** opens the Mini App.
2. In the Mini App, press **Connect FACEIT** → OAuth → your matches appear.
3. Open a live match → coach connects over WebSocket and streams tactical calls.

## Verification (spec §72)

```bash
npm run typecheck   # tsc -b across all packages + apps + bot
npm run lint        # eslint . --max-warnings=0 (no warnings allowed)
npm run test        # vitest — core engines: state-hash, MatchStateEngine,
                    #  TacticalEngine fallback, AiCoordinator dedup+cooldown
npm run build       # tsc builds every workspace (CJS output)
npm run build:web   # Vite production bundle for the Mini App
```

All four pass on a clean checkout.

## Data policy (spec §12 — the non-negotiable rule)

The product **never simulates live data for the real user experience**:

- A match with no live provider shows **"Waiting for live game data"** /
  **"Data unavailable"** in the UI and API responses.
- `Demo mode` is the **only** place simulation is allowed, and it is **dev-only**:
  `DEMO_MODE=true` + non-production `NODE_ENV`. Every demo stream is stamped
  `demo_mode`, the `MatchState` gets `demoMode: true`, and the UI renders a
  visible **"DEMO"** stripe (spec §33).
- The deterministic tactical engine reasons only about *observed* facts
  (economy, score, round, alive players, learned patterns). With an empty
  roster it returns zero instructions — never invented players.
- When Groq is unavailable or fails validation, the AI coordinator answers with
  the deterministic engine and marks the decision `deterministic: true`, so the
  client can tell the player the call came from the built-in coach, not Groq.

## Live pipeline

```
FACEIT webhook / poll  ─┐
CS2 GSI (seam)         ─┼─► GameEventBus ─► MatchStateEngine (MatchState)
Demo (DEMO_MODE only)  ─┘        │
                                 ▼
         RoundEngine · EconomyEngine · StatisticsEngine · OpponentModel
                                 ▼
                        AiCoordinator ─► Groq ─► zod ─► LiveDecision
                              │  (dedup by state hash, cooldown, queue)
                              └─► TacticalEngine fallback (deterministic)
                                 ▼
                    WebSocket → Mini App tactical HUD
```

## Deployment (Render Free + UptimeRobot, spec §68–§69)

1. **Neon**: create a free Postgres; copy the connection string into
   `DATABASE_URL`.
2. **GitHub**: push this repo. In Render, use **Blueprint** and point at
   `render.yaml` — it defines the API (Web), the bot (Web), and the frontend
   (Static).
3. Fill the `sync: false` vars in the Render dashboard (each was marked so it is
   never committed).
4. **UptimeRobot**: monitor `https://<api>.onrender.com/health` every 5 minutes
   so the free web service stays warm and the first user doesn't hit a cold boot.
5. Register the bot token and FACEIT app via `/set_commands` and the FACEIT
   developer portal; webhooks are optional (bot uses long polling, FACEIT uses
   the Data API / webhook when `FACEIT_WEBHOOK_SECRET` is set).

## Security notes (spec §53)

- Telegram Mini App `initData` is HMAC-verified against the bot token before a
  session JWT is minted (`apps/api/src/routes/auth-telegram.ts`).
- FACEIT OAuth tokens are AES-256-GCM encrypted at rest (`packages/shared`).
- Rate limiting (120/min) and CORS origin allow-list on every API route.

## Contributing / scripts

| Script | What it does |
|---|---|
| `npm run migrate` | Apply database migrations |
| `npm run dev:api` `dev:bot` `dev:web` | Run each service in watch mode |
| `npm run test:watch` | Vitest watch |
| `npm run build:web` | Type-check + bundle the Mini App |