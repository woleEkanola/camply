/*
  Warnings:

  - You are about to drop the column `consentForm` on the `CamperProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CamperProfile" DROP COLUMN "consentForm";

-- AlterTable
ALTER TABLE "Registration" ALTER COLUMN "parentConsent" DROP NOT NULL,
ALTER COLUMN "parentConsent" DROP DEFAULT,
ALTER COLUMN "parentConsent" SET DATA TYPE TEXT;
