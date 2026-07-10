-- Campus/Venue/Camp domain model refactor.
-- Hand-edited from the raw `prisma migrate diff` output: converts the
-- default drop/recreate behavior into rename-in-place + explicit backfill so
-- existing data (Locations, Years, Registrations, Hostels, etc.) survives.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Enum value renames (in place, not drop/recreate - existing rows keep
--    their value, just under the new label)
-- ============================================================
ALTER TYPE "UserRole" RENAME VALUE 'LOCATION_ADMIN' TO 'CAMPUS_REPRESENTATIVE';
ALTER TYPE "PermissionType" RENAME VALUE 'CREATE_LOCATION' TO 'CREATE_CAMPUS';
ALTER TYPE "PermissionType" RENAME VALUE 'READ_LOCATION' TO 'READ_CAMPUS';
ALTER TYPE "PermissionType" RENAME VALUE 'UPDATE_LOCATION' TO 'UPDATE_CAMPUS';
ALTER TYPE "PermissionType" RENAME VALUE 'DELETE_LOCATION' TO 'DELETE_CAMPUS';
ALTER TYPE "PermissionType" RENAME VALUE 'MANAGE_LOCATION_ADMINS' TO 'MANAGE_CAMPUS_REPS';

-- ============================================================
-- 2. Rename Location -> Campus, Year -> Camp (table rename preserves rows,
--    ids, and existing FK constraints pointing at them)
-- ============================================================
ALTER TABLE "Location" RENAME TO "Campus";
ALTER TABLE "Year" RENAME TO "Camp";

-- ============================================================
-- 3. Camp.year (new scalar, PRD: "year is one attribute of the camp")
-- ============================================================
ALTER TABLE "Camp" ADD COLUMN "year" INTEGER;
UPDATE "Camp" SET "year" = COALESCE(
  (substring(name FROM '(?:19|20)[0-9]{2}'))::int,
  EXTRACT(YEAR FROM "startDate")::int
);
ALTER TABLE "Camp" ALTER COLUMN "year" SET NOT NULL;

-- ============================================================
-- 4. New Venue table (temporary "_srcCampusId" column used only to backfill
--    FK repoints below; dropped at the end of this migration)
-- ============================================================
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "capacity" INTEGER,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "mapsUrl" TEXT,
    "notes" TEXT,
    "campId" TEXT NOT NULL,
    "code" TEXT,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "signupOpen" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "fullBehavior" TEXT NOT NULL DEFAULT 'CLOSE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "_srcCampusId" TEXT,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- Backfill: one Venue per Campus, linked to that Campus's organization's
-- currently-active Camp (skips campuses whose org has no active camp - those
-- are expected to be pre-launch/test orgs only, per plan decision #2).
INSERT INTO "Venue" (
  "id", "name", "address", "contactPhone", "contactEmail", "mapsUrl",
  "campId", "code", "quota", "signupOpen", "visible", "fullBehavior",
  "_srcCampusId"
)
SELECT
  gen_random_uuid()::text,
  c.name,
  c.address,
  c."contactPhone",
  c."contactEmail",
  c."mapsUrl",
  o."activeYearId",
  c.code,
  c.quota,
  c."signupOpen",
  c.visible,
  c."fullBehavior",
  c.id
FROM "Campus" c
JOIN "Organization" o ON o.id = c."organizationId"
WHERE o."activeYearId" IS NOT NULL;

-- ============================================================
-- 5. Direct renames: same target model, no remap needed
-- ============================================================
ALTER TABLE "Camper" RENAME COLUMN "locationId" TO "homeCampusId";
ALTER TABLE "User" RENAME COLUMN "locationId" TO "homeCampusId";
ALTER TABLE "Department" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "DocumentRequirement" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "IncidentReport" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "MealDistribution" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "MedicalVisit" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "StaffSignupLink" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "Tribe" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "Organization" RENAME COLUMN "activeYearId" TO "activeCampId";
ALTER TABLE "Registration" RENAME COLUMN "locationId" TO "campusId";
ALTER TABLE "Registration" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "RegistrationCounter" RENAME COLUMN "locationId" TO "campusId";
ALTER TABLE "RegistrationCounter" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "SignupLink" RENAME COLUMN "locationId" TO "campusId";
ALTER TABLE "SignupLink" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "StaffProfile" RENAME COLUMN "yearId" TO "campId";
ALTER TABLE "StaffProfile" RENAME COLUMN "preferredLocationId" TO "preferredCampusId";
ALTER TABLE "AttendanceSession" RENAME COLUMN "yearId" TO "campId";

ALTER TABLE "_LocationAdmins" RENAME TO "_CampusReps";

-- ============================================================
-- 6. Remaps: old Location(now Campus) id -> new Venue id, via the temp
--    "_srcCampusId" join column
-- ============================================================
ALTER TABLE "Hostel" ADD COLUMN "venueId" TEXT;
UPDATE "Hostel" h SET "venueId" = v.id
FROM "Venue" v WHERE v."_srcCampusId" = h."locationId";
ALTER TABLE "Hostel" DROP COLUMN "locationId";
ALTER TABLE "Hostel" ALTER COLUMN "venueId" SET NOT NULL;

ALTER TABLE "StaffProfile" ADD COLUMN "assignedVenueId" TEXT;
UPDATE "StaffProfile" sp SET "assignedVenueId" = v.id
FROM "Venue" v WHERE v."_srcCampusId" = sp."assignedLocationId";
ALTER TABLE "StaffProfile" DROP COLUMN "assignedLocationId";

ALTER TABLE "Registration" ADD COLUMN "venueId" TEXT;
ALTER TABLE "Registration" ADD COLUMN "venueAssignedAt" TIMESTAMP(3);
UPDATE "Registration" r SET "venueId" = v.id, "venueAssignedAt" = now()
FROM "Venue" v WHERE v."_srcCampusId" = r."campusId";

ALTER TABLE "AttendanceSession" ADD COLUMN "venueId" TEXT;
UPDATE "AttendanceSession" a SET "venueId" = v.id
FROM "Venue" v WHERE v."_srcCampusId" = a."locationId";
ALTER TABLE "AttendanceSession" DROP COLUMN "locationId";

-- Drop the temp backfill-join column now that all remaps are done.
ALTER TABLE "Venue" DROP COLUMN "_srcCampusId";

-- ============================================================
-- 7. Campus: drop operational (Venue-shaped) columns, rename the rest to
--    their Campus-identity names, add new `pastor` field
-- ============================================================
ALTER TABLE "Campus" DROP COLUMN "quota";
ALTER TABLE "Campus" DROP COLUMN "fullBehavior";
ALTER TABLE "Campus" DROP COLUMN "mapsUrl";
ALTER TABLE "Campus" RENAME COLUMN "contactPhone" TO "phone";
ALTER TABLE "Campus" RENAME COLUMN "contactEmail" TO "email";
ALTER TABLE "Campus" RENAME COLUMN "visible" TO "active";
ALTER TABLE "Campus" ADD COLUMN "pastor" TEXT;

-- ============================================================
-- 8. Foreign keys for new/changed relations
-- ============================================================
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_homeCampusId_fkey" FOREIGN KEY ("homeCampusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Camper" ADD CONSTRAINT "Camper_homeCampusId_fkey" FOREIGN KEY ("homeCampusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_activeCampId_fkey" FOREIGN KEY ("activeCampId") REFERENCES "Camp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Hostel" ADD CONSTRAINT "Hostel_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_assignedVenueId_fkey" FOREIGN KEY ("assignedVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffProfile" RENAME CONSTRAINT "StaffProfile_preferredLocationId_fkey" TO "StaffProfile_preferredCampusId_fkey";
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_tribeId_fkey" FOREIGN KEY ("tribeId") REFERENCES "Tribe"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Department" ADD CONSTRAINT "Department_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- ============================================================
-- 9. Rename indexes/unique constraints to match the new field names
--    (Postgres RENAME COLUMN already updated constraints defined ON those
--    columns automatically; these are the ones whose defining SQL text
--    or naming needs the composite-key rename made explicit)
-- ============================================================
ALTER INDEX "Location_slug_key" RENAME TO "Campus_slug_key";
ALTER INDEX "Location_organizationId_name_key" RENAME TO "Campus_organizationId_name_key";
ALTER INDEX "Year_organizationId_name_key" RENAME TO "Camp_organizationId_name_key";
ALTER INDEX "Year_organizationId_slug_key" RENAME TO "Camp_organizationId_slug_key";
ALTER INDEX "Registration_camperId_yearId_key" RENAME TO "Registration_camperId_campId_key";
ALTER INDEX "Registration_locationId_status_idx" RENAME TO "Registration_campusId_status_idx";
ALTER INDEX "Registration_yearId_status_idx" RENAME TO "Registration_campId_status_idx";
CREATE INDEX "Registration_venueId_status_idx" ON "Registration"("venueId", "status");
ALTER INDEX "RegistrationCounter_yearId_locationId_key" RENAME TO "RegistrationCounter_campId_campusId_key";
ALTER INDEX "SignupLink_locationId_yearId_key" RENAME TO "SignupLink_campusId_campId_key";
ALTER INDEX "StaffProfile_userId_yearId_key" RENAME TO "StaffProfile_userId_campId_key";
ALTER INDEX "StaffSignupLink_yearId_type_key" RENAME TO "StaffSignupLink_campId_type_key";
ALTER INDEX "Tribe_yearId_name_key" RENAME TO "Tribe_campId_name_key";
ALTER INDEX "Department_organizationId_yearId_name_key" RENAME TO "Department_organizationId_campId_name_key";
CREATE UNIQUE INDEX "Hostel_venueId_name_key" ON "Hostel"("venueId", "name");
CREATE UNIQUE INDEX "Venue_campId_name_key" ON "Venue"("campId", "name");
