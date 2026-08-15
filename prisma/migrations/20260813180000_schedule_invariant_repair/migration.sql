-- Idempotent repair performed separately from the additive constraints.
-- Preserve every schedule and its audit history while making revisions deterministic.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "campId" ORDER BY "createdAt" ASC, "id" ASC
  ) AS repaired_revision
  FROM "CampSchedule"
)
UPDATE "CampSchedule" AS schedule
SET "revision" = ranked.repaired_revision
FROM ranked
WHERE schedule."id" = ranked."id"
  AND schedule."revision" <> ranked.repaired_revision;

-- If legacy data contains multiple published schedules, retain the newest one.
WITH ranked_published AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "campId" ORDER BY "updatedAt" DESC, "revision" DESC, "id" DESC
  ) AS published_rank
  FROM "CampSchedule"
  WHERE "status" = 'PUBLISHED'
)
UPDATE "CampSchedule" AS schedule
SET "status" = 'ARCHIVED'
FROM ranked_published
WHERE schedule."id" = ranked_published."id"
  AND ranked_published.published_rank > 1;
