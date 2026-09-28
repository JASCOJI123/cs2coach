-- The product is now a standalone website: users sign in with FACEIT and
-- Telegram is an optional notification channel linked from settings.
ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_linked_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'uz';

-- Existing Telegram users already talk to the bot in a private chat whose id
-- equals their Telegram user id.
UPDATE users
   SET telegram_chat_id = telegram_id,
       telegram_linked_at = coalesce(telegram_linked_at, created_at)
 WHERE telegram_id IS NOT NULL AND telegram_chat_id IS NULL;

-- One-time deep-link tokens: t.me/<bot>?start=link_<token>
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user ON telegram_link_tokens (user_id);

-- De-duplicates notifications across webhook, Node interval and Worker cron.
CREATE TABLE IF NOT EXISTS notification_log (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  ref        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref)
);
