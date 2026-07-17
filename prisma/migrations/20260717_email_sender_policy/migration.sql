-- AlterTable
ALTER TABLE "EmailEventConfig" ADD COLUMN "senderMode" TEXT NOT NULL DEFAULT 'ORG_SLUG',
ADD COLUMN "customFromLocalPart" TEXT,
ADD COLUMN "replyTo" TEXT;

-- AlterTable
ALTER TABLE "Broadcast" ADD COLUMN "senderMode" TEXT NOT NULL DEFAULT 'ORG_SLUG',
ADD COLUMN "customFromLocalPart" TEXT,
ADD COLUMN "replyTo" TEXT;
