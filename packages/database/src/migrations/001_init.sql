-- CS2 AI COACH — schema (spec §34/§35)
-- Neon PostgreSQL 15+. All timestamps UTC.

-- ── users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id      bigint NOT NULL UNIQUE,
  telegram_username text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

-- ── faceit_accounts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faceit_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  faceit_user_id   text NOT NULL UNIQUE,
  nickname         text NOT NULL,
  avatar           text,
  country          text,
  skill_level      int,
  elo              int,
  access_token     text,
  refresh_token    text,
  expires_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_faceit_accounts_user ON faceit_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_faceit_accounts_faceit_user ON faceit_accounts (faceit_user_id);

-- ── players ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faceit_player_id  text NOT NULL UNIQUE,
  nickname          text NOT NULL,
  country           text,
  avatar            text,
  skill_level       int,
  elo               int,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_players_faceit_player ON players (faceit_player_id);

-- ── teams ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faceit_team_id    text UNIQUE,
  name              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teams_faceit_team ON teams (faceit_team_id);

-- ── matches ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faceit_match_id  text NOT NULL UNIQUE,
  game             text NOT NULL DEFAULT 'cs2',
  competition      text,
  map              text,
  status           text NOT NULL,
  started_at       timestamptz,
  finished_at      timestamptz,
  team_a_id        uuid REFERENCES teams(id),
  team_b_id        uuid REFERENCES teams(id),
  score_a          int NOT NULL DEFAULT 0,
  score_b          int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matches_faceit_match ON matches (faceit_match_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches (created_at DESC);

-- ── match_players ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_players (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id       uuid NOT NULL REFERENCES players(id),
  team            text NOT NULL,
  role            text,
  kills           int NOT NULL DEFAULT 0,
  deaths          int NOT NULL DEFAULT 0,
  assists         int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players (match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players (player_id);

-- ── rounds ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rounds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_number    int NOT NULL,
  winner          text,
  side            text,
  win_reason      text,
  score_after_round text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, round_number)
);
CREATE INDEX IF NOT EXISTS idx_rounds_match ON rounds (match_id);
CREATE INDEX IF NOT EXISTS idx_rounds_round ON rounds (round_number);

-- ── player_round_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_round_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id        uuid REFERENCES players(id),
  event_type       text NOT NULL,
  "timestamp"      timestamptz NOT NULL DEFAULT now(),
  x                double precision,
  y                double precision,
  z                double precision,
  weapon           text,
  damage           int,
  target_player_id uuid REFERENCES players(id),
  metadata_json    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pre_round ON player_round_events (round_id);
CREATE INDEX IF NOT EXISTS idx_pre_player ON player_round_events (player_id);

-- ── player_statistics ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_statistics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid NOT NULL REFERENCES players(id),
  match_id         uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  kills            int NOT NULL DEFAULT 0,
  deaths           int NOT NULL DEFAULT 0,
  assists          int NOT NULL DEFAULT 0,
  adr              double precision,
  kast             double precision,
  rating           double precision,
  opening_kills    int NOT NULL DEFAULT 0,
  opening_deaths   int NOT NULL DEFAULT 0,
  utility_damage   int NOT NULL DEFAULT 0,
  flash_assists    int NOT NULL DEFAULT 0,
  clutches         int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_statistics (player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_match ON player_statistics (match_id);

-- ── opponent_patterns ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opponent_patterns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id        uuid REFERENCES players(id),
  pattern_type     text NOT NULL,
  location         text NOT NULL,
  frequency        double precision NOT NULL DEFAULT 0,
  confidence       text NOT NULL DEFAULT 'LOW',
  sample_size      int NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_match ON opponent_patterns (match_id);
CREATE INDEX IF NOT EXISTS idx_op_player ON opponent_patterns (player_id);

-- ── ai_recommendations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id           uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_id           uuid REFERENCES rounds(id) ON DELETE SET NULL,
  player_id          uuid REFERENCES players(id),
  recommendation_type text NOT NULL,
  action             text NOT NULL,
  location           text,
  timing             text,
  confidence         double precision NOT NULL DEFAULT 0,
  reasoning          text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_match ON ai_recommendations (match_id);
CREATE INDEX IF NOT EXISTS idx_rec_round ON ai_recommendations (round_id);

-- ── ai_decisions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_decisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id       uuid REFERENCES matches(id) ON DELETE CASCADE,
  round_id       uuid REFERENCES rounds(id) ON DELETE SET NULL,
  state_hash     text NOT NULL,
  input_summary  jsonb,
  decision       jsonb NOT NULL,
  confidence     double precision,
  model          text,
  latency        int,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_match ON ai_decisions (match_id);

-- ── match_analysis ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_analysis (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id           uuid NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  pre_match_analysis jsonb,
  live_analysis      jsonb,
  post_match_analysis jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ── training_plans ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id   uuid REFERENCES matches(id) ON DELETE SET NULL,
  plan_json  jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_training_user ON training_plans (user_id);