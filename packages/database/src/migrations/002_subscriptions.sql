-- Subscription-ready user plans. Billing provider integration can be added later.
CREATE TABLE IF NOT EXISTS subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan          text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'past_due')),
  provider      text,
  provider_id   text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);

-- Every existing/new user gets a free entitlement lazily through the repository.
