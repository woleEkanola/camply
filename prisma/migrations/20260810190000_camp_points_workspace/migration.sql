-- Camp Points workspace — additive and rolling-deploy safe.
-- Existing application versions ignore every new nullable/defaulted column.

ALTER TABLE "Position"
  ADD COLUMN "grantsAwardPoints" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AttendanceSession"
  ADD COLUMN "campusId" TEXT;

ALTER TABLE "ScoredSession"
  ADD COLUMN "campusId" TEXT,
  ADD COLUMN "awardPoints" INTEGER,
  ADD COLUMN "createdById" TEXT;

CREATE INDEX "AttendanceSession_campusId_date_idx"
  ON "AttendanceSession"("campusId", "date");

CREATE INDEX "ScoredSession_createdById_status_idx"
  ON "ScoredSession"("createdById", "status");

-- Missing activity templates requested by the Camp Points workflow. The
-- existing SERVICE category is used for "Being Helpful" and SPORTS for games.
INSERT INTO "ScoreCategory"
  ("id", "campId", "key", "name", "description", "defaultPoints", "kind", "isPenalty", "enabled", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('seed-cat-good-behaviour', NULL, 'GOOD_BEHAVIOUR', 'Good Behaviour',
   'Positive conduct and setting a good example.', 10, 'MANUAL', false, true, 20, now(), now()),
  ('seed-cat-participation', NULL, 'PARTICIPATION', 'Participation',
   'Active and positive participation in a camp activity.', 10, 'BOTH', false, true, 21, now(), now())
ON CONFLICT ("id") DO NOTHING;
