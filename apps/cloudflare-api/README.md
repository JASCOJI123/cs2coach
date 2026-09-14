# CS2Coach Cloudflare API

This Worker keeps the existing Fastify API and runs it through Cloudflare's Node.js HTTP compatibility layer. WebSocket upgrade handling is intentionally disabled in this first migration; live WebSocket delivery will be moved to a Durable Object in the next step.

## Free deployment setup

1. Create a Cloudflare Hyperdrive config pointing to the existing Neon PostgreSQL database:

```bash
npx wrangler hyperdrive create cs2coach-neon --connection-string="<NEON_CONNECTION_STRING>"
```

2. Copy the returned Hyperdrive `id` into `wrangler.jsonc`, replacing `REPLACE_WITH_HYPERDRIVE_ID`.

3. Add the required secrets:

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put FACEIT_API_KEY
npx wrangler secret put FACEIT_CLIENT_ID
npx wrangler secret put FACEIT_CLIENT_SECRET
npx wrangler secret put FACEIT_REDIRECT_URI
npx wrangler secret put FACEIT_WEBHOOK_SECRET
npx wrangler secret put CS2_GSI_TOKEN
npx wrangler secret put GROQ_API_KEY
```

4. Deploy from the repository root:

```bash
npx wrangler deploy
```

The Worker uses the existing Neon schema and does not run migrations automatically. Cron runs every five minutes to sync linked FACEIT histories.
