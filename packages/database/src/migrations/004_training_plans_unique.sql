-- Prevent duplicate training plans for the same user/match.
-- Keep the newest plan and then enforce uniqueness for non-null match ids.
DELETE FROM training_plans a
USING training_plans b
WHERE a.user_id = b.user_id
  AND a.match_id = b.match_id
  AND a.match_id IS NOT NULL
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_plans_user_match
  ON training_plans (user_id, match_id)
  WHERE match_id IS NOT NULL;
