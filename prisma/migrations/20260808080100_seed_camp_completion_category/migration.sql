-- Data-only: adds the CAMP_COMPLETION ScoreCategory the spec names as an
-- automatic scoring trigger. Kept separate from the structural migration
-- above, and safe to re-run/resume (fixed literal id + ON CONFLICT DO
-- NOTHING), exactly like 20260807093704_leaderboard_seed_categories.
--
-- sortOrder 20 continues that migration's 0-19 sequence.

INSERT INTO "ScoreCategory" ("id", "campId", "key", "name", "description", "defaultPoints", "kind", "isPenalty", "enabled", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('seed-cat-camp-completion', NULL, 'CAMP_COMPLETION', 'Camp Completion',
   'Awarded once when a camper or staff member completes camp. See LeaderboardSettings.completionMode.',
   50, 'AUTO', false, true, 20, now(), now())
ON CONFLICT ("id") DO NOTHING;
