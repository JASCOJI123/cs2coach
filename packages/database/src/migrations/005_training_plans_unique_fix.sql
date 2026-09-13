-- Migration 004 created a partial unique index, which PostgreSQL cannot
-- infer for the ON CONFLICT (user_id, match_id) upsert used by the API.
-- Replace it with a normal composite unique index. Multiple NULL match_id
-- values remain allowed by PostgreSQL UNIQUE semantics.
DROP INDEX IF EXISTS uq_training_plans_user_match;
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_plans_user_match
  ON training_plans (user_id, match_id);
