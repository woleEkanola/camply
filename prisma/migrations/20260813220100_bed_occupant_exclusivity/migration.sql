-- A bed may hold a camper registration or a staff profile, never both.
ALTER TABLE "Bed"
ADD CONSTRAINT "Bed_single_occupant_check"
CHECK ("registrationId" IS NULL OR "staffProfileId" IS NULL)
NOT VALID;

ALTER TABLE "Bed" VALIDATE CONSTRAINT "Bed_single_occupant_check";
