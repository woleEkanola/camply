-- AlterTable
ALTER TABLE "Camp" RENAME CONSTRAINT "Year_pkey" TO "Camp_pkey";

-- AlterTable
ALTER TABLE "Campus" RENAME CONSTRAINT "Location_pkey" TO "Campus_pkey";
ALTER TABLE "Campus" DROP COLUMN "code",
ADD COLUMN     "campusCode" TEXT,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Venue" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "_CampusReps" RENAME CONSTRAINT "_LocationAdmins_AB_pkey" TO "_CampusReps_AB_pkey";

-- RenameForeignKey
ALTER TABLE "AttendanceSession" RENAME CONSTRAINT "AttendanceSession_yearId_fkey" TO "AttendanceSession_campId_fkey";

-- RenameForeignKey
ALTER TABLE "Camp" RENAME CONSTRAINT "Year_organizationId_fkey" TO "Camp_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "Campus" RENAME CONSTRAINT "Location_organizationId_fkey" TO "Campus_organizationId_fkey";

-- RenameForeignKey
ALTER TABLE "DocumentRequirement" RENAME CONSTRAINT "DocumentRequirement_yearId_fkey" TO "DocumentRequirement_campId_fkey";

-- RenameForeignKey
ALTER TABLE "IncidentReport" RENAME CONSTRAINT "IncidentReport_yearId_fkey" TO "IncidentReport_campId_fkey";

-- RenameForeignKey
ALTER TABLE "MealDistribution" RENAME CONSTRAINT "MealDistribution_yearId_fkey" TO "MealDistribution_campId_fkey";

-- RenameForeignKey
ALTER TABLE "MedicalVisit" RENAME CONSTRAINT "MedicalVisit_yearId_fkey" TO "MedicalVisit_campId_fkey";

-- RenameForeignKey
ALTER TABLE "Registration" RENAME CONSTRAINT "Registration_locationId_fkey" TO "Registration_campusId_fkey";

-- RenameForeignKey
ALTER TABLE "Registration" RENAME CONSTRAINT "Registration_yearId_fkey" TO "Registration_campId_fkey";

-- RenameForeignKey
ALTER TABLE "RegistrationCounter" RENAME CONSTRAINT "RegistrationCounter_locationId_fkey" TO "RegistrationCounter_campusId_fkey";

-- RenameForeignKey
ALTER TABLE "RegistrationCounter" RENAME CONSTRAINT "RegistrationCounter_yearId_fkey" TO "RegistrationCounter_campId_fkey";

-- RenameForeignKey
ALTER TABLE "SignupLink" RENAME CONSTRAINT "SignupLink_locationId_fkey" TO "SignupLink_campusId_fkey";

-- RenameForeignKey
ALTER TABLE "SignupLink" RENAME CONSTRAINT "SignupLink_yearId_fkey" TO "SignupLink_campId_fkey";

-- RenameForeignKey
ALTER TABLE "StaffProfile" RENAME CONSTRAINT "StaffProfile_yearId_fkey" TO "StaffProfile_campId_fkey";

-- RenameForeignKey
ALTER TABLE "StaffSignupLink" RENAME CONSTRAINT "StaffSignupLink_yearId_fkey" TO "StaffSignupLink_campId_fkey";

-- RenameForeignKey
ALTER TABLE "Tribe" RENAME CONSTRAINT "Tribe_yearId_fkey" TO "Tribe_campId_fkey";

-- RenameIndex
ALTER INDEX "_LocationAdmins_B_index" RENAME TO "_CampusReps_B_index";

