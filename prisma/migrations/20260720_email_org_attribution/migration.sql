-- AlterTable
ALTER TABLE "EmailRecipient" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SideEffect" ADD COLUMN     "organizationId" TEXT;

-- CreateIndex
CREATE INDEX "EmailRecipient_organizationId_createdAt_idx" ON "EmailRecipient"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "SideEffect_organizationId_status_idx" ON "SideEffect"("organizationId", "status");

-- Backfill: attribute existing rows to their org so org-scoped queue/log
-- queries see historical data. EmailRecipient: campaign org wins; transactional
-- rows (campaignId NULL) fall back to the recipient user's org.
UPDATE "EmailRecipient" er SET "organizationId" = c."organizationId"
FROM "EmailCampaign" c
WHERE er."campaignId" = c.id AND er."organizationId" IS NULL;

UPDATE "EmailRecipient" er SET "organizationId" = u."organizationId"
FROM "User" u
WHERE er."userId" = u.id AND er."organizationId" IS NULL;

-- SideEffect: campaign send effects, then registration effects (via camp),
-- then broadcast effects (via recipient -> broadcast).
UPDATE "SideEffect" se SET "organizationId" = c."organizationId"
FROM "EmailCampaign" c
WHERE se."campaignId" = c.id AND se."organizationId" IS NULL;

UPDATE "SideEffect" se SET "organizationId" = c."organizationId"
FROM "Registration" r
JOIN "Camp" c ON r."campId" = c.id
WHERE se."registrationId" = r.id AND se."organizationId" IS NULL;

UPDATE "SideEffect" se SET "organizationId" = b."organizationId"
FROM "BroadcastRecipient" br
JOIN "Broadcast" b ON br."broadcastId" = b.id
WHERE se."broadcastRecipientId" = br.id AND se."organizationId" IS NULL;
