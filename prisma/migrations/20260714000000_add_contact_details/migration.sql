-- DropForeignKey
ALTER TABLE "BroadcastRecipient" DROP CONSTRAINT "BroadcastRecipient_broadcastId_fkey";
-- DropForeignKey
ALTER TABLE "EmailEventConfig" DROP CONSTRAINT "EmailEventConfig_templateId_fkey";
-- DropForeignKey
ALTER TABLE "OrganizationBranding" DROP CONSTRAINT "OrganizationBranding_organizationId_fkey";
-- DropForeignKey
ALTER TABLE "RegistrationReview" DROP CONSTRAINT "RegistrationReview_registrationId_fkey";
-- AlterTable
ALTER TABLE "Camper" DROP COLUMN "homeAddressCity",
DROP COLUMN "homeAddressState",
DROP COLUMN "homeAddressStreet",
DROP COLUMN "homeAddressZip",
DROP COLUMN "parentPhone",
DROP COLUMN "teenPhone";
-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "approvalWorkflow";
-- AlterTable
ALTER TABLE "Registration" DROP COLUMN "communicationLog",
DROP COLUMN "fieldChangeLog";
-- AlterTable
ALTER TABLE "SideEffect" DROP COLUMN "broadcastRecipientId",
ALTER COLUMN "registrationId" SET NOT NULL;
-- DropTable
DROP TABLE "Broadcast";
-- DropTable
DROP TABLE "BroadcastRecipient";
-- DropTable
DROP TABLE "EmailEventConfig";
-- DropTable
DROP TABLE "EmailTemplate";
-- DropTable
DROP TABLE "OrganizationBranding";
-- DropTable
DROP TABLE "RegistrationReview";
