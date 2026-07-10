-- Rename the UserRole enum value BASE_USER -> PARENT.
ALTER TYPE "UserRole" RENAME VALUE 'BASE_USER' TO 'PARENT';

-- Rename the CamperProfile model/table -> Camper.
ALTER TABLE "CamperProfile" RENAME TO "Camper";

-- Rename the FK columns that referenced CamperProfile -> camperId.
ALTER TABLE "ProfileFieldValue" RENAME COLUMN "camperProfileId" TO "camperId";
ALTER TABLE "Registration" RENAME COLUMN "camperProfileId" TO "camperId";
ALTER TABLE "Document" RENAME COLUMN "camperProfileId" TO "camperId";

-- Rename constraints to match Prisma's default naming convention for the new names.
ALTER TABLE "Camper" RENAME CONSTRAINT "CamperProfile_pkey" TO "Camper_pkey";
ALTER TABLE "Camper" RENAME CONSTRAINT "CamperProfile_locationId_fkey" TO "Camper_locationId_fkey";
ALTER TABLE "Camper" RENAME CONSTRAINT "CamperProfile_organizationId_fkey" TO "Camper_organizationId_fkey";
ALTER TABLE "Camper" RENAME CONSTRAINT "CamperProfile_userId_fkey" TO "Camper_userId_fkey";
ALTER TABLE "ProfileFieldValue" RENAME CONSTRAINT "ProfileFieldValue_camperProfileId_fkey" TO "ProfileFieldValue_camperId_fkey";
ALTER TABLE "Registration" RENAME CONSTRAINT "Registration_camperProfileId_fkey" TO "Registration_camperId_fkey";
ALTER TABLE "Document" RENAME CONSTRAINT "Document_camperProfileId_fkey" TO "Document_camperId_fkey";

-- Rename the (non-constraint-backed) unique indexes to match.
ALTER INDEX "ProfileFieldValue_fieldId_camperProfileId_key" RENAME TO "ProfileFieldValue_fieldId_camperId_key";
ALTER INDEX "Registration_camperProfileId_yearId_key" RENAME TO "Registration_camperId_yearId_key";
