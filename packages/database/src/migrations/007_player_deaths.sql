-- Deaths of CS2 Ustoz users, detected live from CS2 GSI (own position only).
-- Powers the post-match death map and timing review. Enemy positions are
-- never known here; they can be added later from the match demo.
CREATE TABLE IF NOT EXISTS player_deaths (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id           uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id          uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round_number       int NOT NULL,
  seconds_into_round real,
  side               text,
  x                  real NOT NULL,
  y                  real NOT NULL,
  z                  real NOT NULL,
  weapon             text,
  round_won          boolean,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id, round_number)
);
CREATE INDEX IF NOT EXISTS idx_player_deaths_match ON player_deaths (match_id, round_number);
