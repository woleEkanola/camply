-- Re-runnable data backfill. Canonical gender values are uppercase throughout
-- allocation, accommodation, filtering, and reporting code.
UPDATE "Camper"
SET "gender" = UPPER(TRIM("gender"))
WHERE UPPER(TRIM("gender")) IN ('MALE', 'FEMALE')
  AND "gender" IS DISTINCT FROM UPPER(TRIM("gender"));

UPDATE "StaffProfile"
SET "gender" = UPPER(TRIM("gender"))
WHERE UPPER(TRIM("gender")) IN ('MALE', 'FEMALE')
  AND "gender" IS DISTINCT FROM UPPER(TRIM("gender"));
