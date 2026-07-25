-- AlterTable
ALTER TABLE "EmailTemplate" ADD COLUMN     "includeIdCard" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrganizationBranding" ADD COLUMN     "idCardEnabled" BOOLEAN NOT NULL DEFAULT false;

