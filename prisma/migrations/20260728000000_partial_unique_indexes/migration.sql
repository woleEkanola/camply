-- Adds the partial unique indexes (WHERE "deletedAt" IS NULL) that 11 schema
-- comments across this file falsely claimed were "added by hand in the
-- migration" — none of them exist in any prior migration.sql. Application
-- code in several places (most notably
-- src/server/registration/validation.ts's duplicate-registration check)
-- explicitly relies on a DB-level backstop that was never actually there.
--
-- Run scripts/check-duplicate-constraint-violations.js against the target
-- database BEFORE deploying this migration anywhere with real data —
-- existing duplicate rows will make `CREATE UNIQUE INDEX` fail, and
-- resolving them is a data decision for a human, not something to automate.

CREATE UNIQUE INDEX IF NOT EXISTS "Campus_organizationId_name_key"
  ON "Campus"("organizationId", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Venue_campId_name_key"
  ON "Venue"("campId", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "FormField_organizationId_audience_name_key"
  ON "FormField"("organizationId", "audience", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Camp_organizationId_name_key"
  ON "Camp"("organizationId", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Camp_organizationId_slug_key"
  ON "Camp"("organizationId", "slug") WHERE "deletedAt" IS NULL;

-- Lets a camper re-register for the same camp after a prior registration was
-- soft-deleted (the WHERE clause is what makes that legal).
CREATE UNIQUE INDEX IF NOT EXISTS "Registration_camperId_campId_key"
  ON "Registration"("camperId", "campId") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Tribe_campId_name_key"
  ON "Tribe"("campId", "name") WHERE "deletedAt" IS NULL;

-- "code" is nullable; Postgres unique indexes never treat two NULLs as a
-- conflict, so this only constrains tribes that actually set a code.
CREATE UNIQUE INDEX IF NOT EXISTS "Tribe_campId_code_key"
  ON "Tribe"("campId", "code") WHERE "deletedAt" IS NULL AND "code" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "StaffProfile_userId_campId_key"
  ON "StaffProfile"("userId", "campId") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Department_organizationId_campId_name_key"
  ON "Department"("organizationId", "campId", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Hostel_venueId_name_key"
  ON "Hostel"("venueId", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Room_hostelId_name_key"
  ON "Room"("hostelId", "name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Bed_roomId_label_key"
  ON "Bed"("roomId", "label") WHERE "deletedAt" IS NULL;
