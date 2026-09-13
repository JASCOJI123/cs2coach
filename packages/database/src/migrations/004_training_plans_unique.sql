-- Prevent duplicate training plans for the same user/match.
-- PostgreSQL UNIQUE permits multiple NULL match_id values, so a normal
-- composite unique index gives the desired semantics and supports ON CONFLICT.
DELETE FROM training_plans a
USING training_plans b
WHERE a.user_id = b.user_id
  AND a.match_id = b.match_id
  AND a.match_id IS NOT NULL
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_plans_user_match
  ON training_plans (user_id, match_id);
