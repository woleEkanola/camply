-- AlterTable
ALTER TABLE "CamperProfile" ADD COLUMN     "dobApproved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "parentConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false;
