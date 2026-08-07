-- Partial unique indexes for LeaderboardStat, via raw SQL (repo convention —
-- precedent: 20260728000000_partial_unique_indexes). "day" is NULL for the
-- one all-time TOTAL row per subject and set for daily rows; a plain
-- composite unique can't express "one TOTAL row + one row per day" because
-- Postgres does not treat NULL as equal to itself in a unique constraint,
-- which is exactly what's needed here but not what a bare @@unique gives you
-- without the WHERE clause.

CREATE UNIQUE INDEX IF NOT EXISTS "LeaderboardStat_camp_subject_total_key"
  ON "LeaderboardStat"("campId", "subjectType", "subjectId")
  WHERE "day" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "LeaderboardStat_camp_subject_day_key"
  ON "LeaderboardStat"("campId", "subjectType", "subjectId", "day")
  WHERE "day" IS NOT NULL;
