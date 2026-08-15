-- Backfill for the department reconciliation feature. Separate from the
-- preceding DDL-only migration and safe to re-run: every statement here is
-- idempotent (re-running produces the same end state).

-- 1) PositionAssignment.isPrimary: preserve exactly what the existing
--    derive-at-read-time logic reports today (a department is "primary" iff
--    it equals the staff profile's current StaffProfile.departmentId).
UPDATE "PositionAssignment" pa
SET "isPrimary" = true
FROM "Position" p, "StaffProfile" sp
WHERE pa."positionId" = p.id
  AND pa."staffId" = sp.id
  AND pa."isCurrent" = true
  AND sp."departmentId" IS NOT NULL
  AND p."departmentId" = sp."departmentId"
  AND pa."isPrimary" = false;

-- Any current assignment that no longer matches the staff profile's primary
-- department (e.g. drifted state) should not be marked primary.
UPDATE "PositionAssignment" pa
SET "isPrimary" = false
FROM "Position" p, "StaffProfile" sp
WHERE pa."positionId" = p.id
  AND pa."staffId" = sp.id
  AND pa."isCurrent" = true
  AND pa."isPrimary" = true
  AND (sp."departmentId" IS NULL OR p."departmentId" IS DISTINCT FROM sp."departmentId");

-- 2) Department.jdKey: exact-name match against the 2026 JD document
--    (prisma/data/teen-camp-organogram-2026.json). Only stamps departments
--    that don't already have a jdKey, so re-running (or running after a
--    fresh "Install 2026 JD") never overwrites a manual/prior value.
UPDATE "Department" d
SET "jdKey" = v.jd_key
FROM (VALUES
  ('Camp Board', 'camp-board'),
  ('Camp Command', 'camp-command'),
  ('People & Programmes', 'people-programmes'),
  ('Operations', 'operations'),
  ('Registration', 'registration'),
  ('Programme & Protocol', 'programme-protocol'),
  ('Prayer', 'prayer'),
  ('Counselling', 'counselling'),
  ('Games & Recreation', 'games-recreation'),
  ('Food & Catering', 'food-catering'),
  ('Accommodation', 'accommodation'),
  ('Tribe Heads', 'tribe-heads'),
  ('Facilities', 'facilities'),
  ('Venue Management Department (VMD)', 'venue-management-department'),
  ('Medical', 'medical'),
  ('Security', 'security'),
  ('Transport & Logistics', 'transport-logistics'),
  ('IT & Digital Systems', 'it-digital-systems'),
  ('Communications', 'communications'),
  ('Media', 'media')
) AS v(jd_name, jd_key)
WHERE d.name = v.jd_name
  AND d."jdKey" IS NULL
  AND d."deletedAt" IS NULL;
