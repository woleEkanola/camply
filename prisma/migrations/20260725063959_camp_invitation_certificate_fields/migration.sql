-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "personalizeCampId" TEXT,
ADD COLUMN     "personalizeEvent" TEXT;

-- AlterTable
ALTER TABLE "OrganizationBranding" ADD COLUMN     "footerCopyright" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "nextSteps" JSONB,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "supportDescription" TEXT,
ADD COLUMN     "supportTitle" TEXT,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "xUrl" TEXT;

