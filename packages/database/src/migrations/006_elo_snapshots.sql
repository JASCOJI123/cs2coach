-- Track FACEIT ELO over time for the 7-day change shown in the Mini App.
CREATE TABLE IF NOT EXISTS elo_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  elo         int NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_elo_snapshots_user_captured
  ON elo_snapshots (user_id, captured_at DESC);
