ALTER TABLE "StaffProfile" ADD COLUMN "preferredDepartmentId" TEXT;

UPDATE "StaffProfile"
SET "preferredDepartmentId" = "departmentId"
WHERE "departmentId" IS NOT NULL;

CREATE INDEX "StaffProfile_preferredDepartmentId_idx" ON "StaffProfile"("preferredDepartmentId");

ALTER TABLE "StaffProfile"
ADD CONSTRAINT "StaffProfile_preferredDepartmentId_fkey"
FOREIGN KEY ("preferredDepartmentId") REFERENCES "Department"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
