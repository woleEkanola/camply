-- Additive invariants: old application builds remain compatible with this schema.
CREATE UNIQUE INDEX IF NOT EXISTS "CampSchedule_campId_revision_key"
  ON "CampSchedule"("campId", "revision");

CREATE UNIQUE INDEX IF NOT EXISTS "CampSchedule_one_published_per_camp_key"
  ON "CampSchedule"("campId")
  WHERE "status" = 'PUBLISHED';
