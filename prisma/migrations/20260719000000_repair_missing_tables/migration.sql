-- Repair migration: closes drift between prisma/schema.prisma and the actual
-- migration history. Every statement here is idempotent (IF NOT EXISTS /
-- guarded DO blocks) so it is a no-op on any database that already has this
-- shape via `db push` drift (this repo's local and production databases both
-- do), and a genuine build on a database that only ever ran `migrate deploy`.
--
-- Two categories of drift, discovered by diffing the accumulated column set
-- across every existing migration.sql against a fresh `--from-empty` schema
-- dump (not just checking for missing CREATE TABLEs):
--
--   1. Nine tables with NO migration ever creating them (some later
--      migrations ALTER them, e.g. 20260720_email_org_attribution adds a
--      column to "EmailRecipient", which would fail on a true fresh replay
--      since the table doesn't exist yet at that point in history).
--   2. Column-level drift on five tables that DO exist historically
--      (Camper, Camp, Registration, Tribe, SideEffect) — the tribe
--      allocation/recommendation feature and Camper.medicalProfile were
--      built entirely via drift, no migration ever attempted them.
--
-- Historical-shape note: EmailCampaign is created here WITHOUT
-- personalizeEvent/personalizeCampId (added later by
-- 20260725063959_camp_invitation_certificate_fields) and EmailRecipient is
-- created WITHOUT organizationId (added later by
-- 20260720_email_org_attribution) so those later migrations still apply
-- cleanly in order on a fresh database.

-- ── 1. Column-level drift on existing tables ──────────────────────────────

ALTER TABLE "Camper" ADD COLUMN IF NOT EXISTS "medicalProfile" JSONB;

ALTER TABLE "Camp" ADD COLUMN IF NOT EXISTS "targetTribeSize" INTEGER;
ALTER TABLE "Camp" ADD COLUMN IF NOT EXISTS "tribeAllocationPresets" JSONB;

ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "isTribeLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "suggestedTribeId" TEXT;
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "tribeSuggestedAt" TIMESTAMP(3);
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "tribeRecommendationStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "tribeRecommendationReason" JSONB;
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "tribeRecommendationScore" DOUBLE PRECISION;
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "tribeRecommendationBreakdown" JSONB;
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "tribeOriginalSuggestedId" TEXT;

ALTER TABLE "Tribe" ADD COLUMN IF NOT EXISTS "isAllocationLocked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SideEffect" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
ALTER TABLE "SideEffect" ADD COLUMN IF NOT EXISTS "deliverySource" TEXT;
ALTER TABLE "SideEffect" ADD COLUMN IF NOT EXISTS "recipientEmail" TEXT;
ALTER TABLE "SideEffect" ADD COLUMN IF NOT EXISTS "recipientType" TEXT;
ALTER TABLE "SideEffect" ADD COLUMN IF NOT EXISTS "txId" TEXT;

-- ── 2. Tables missing entirely ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "TeacherCampusQuota" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "quotaFullBehavior" TEXT NOT NULL DEFAULT 'CLOSE',

    CONSTRAINT "TeacherCampusQuota_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TribeAllocationLog" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tribeId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "allocationMode" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "rulesetSnapshot" JSONB NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "reasons" JSONB NOT NULL,
    "wasOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overriddenById" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TribeAllocationLog_pkey" PRIMARY KEY ("id")
);

-- Historical shape: no personalizeEvent/personalizeCampId (see note above).
CREATE TABLE IF NOT EXISTS "EmailCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "templateId" TEXT,
    "body" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "audienceFilter" JSONB,
    "savedAudienceId" TEXT,
    "senderMode" TEXT NOT NULL DEFAULT 'ORG_SLUG',
    "customFromLocalPart" TEXT,
    "replyTo" TEXT,
    "attachments" JSONB,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- Historical shape: no organizationId (see note above).
CREATE TABLE IF NOT EXISTS "EmailRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "userId" TEXT NOT NULL,
    "registrationId" TEXT,
    "email" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'QUEUED',
    "deliverySource" TEXT,
    "subject" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "sideEffectId" TEXT,
    "readAt" TIMESTAMP(3),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SavedAudience" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filterDefinition" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedAudience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScanEvent" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "campId" TEXT,
    "station" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "volunteerId" TEXT NOT NULL,
    "device" TEXT,
    "location" TEXT,
    "result" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SignupLinkClick" (
    "id" TEXT NOT NULL,
    "signupLinkId" TEXT NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupLinkClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffSignupLinkClick" (
    "id" TEXT NOT NULL,
    "staffSignupLinkId" TEXT NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSignupLinkClick_pkey" PRIMARY KEY ("id")
);

-- ── 3. Indexes on the new tables ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "TeacherCampusQuota_campId_idx" ON "TeacherCampusQuota"("campId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherCampusQuota_campId_campusId_key" ON "TeacherCampusQuota"("campId", "campusId");

CREATE INDEX IF NOT EXISTS "EmailCampaign_organizationId_status_idx" ON "EmailCampaign"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "EmailCampaign_organizationId_createdAt_idx" ON "EmailCampaign"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailCampaign_deletedAt_idx" ON "EmailCampaign"("deletedAt");

CREATE INDEX IF NOT EXISTS "EmailRecipient_campaignId_deliveryStatus_idx" ON "EmailRecipient"("campaignId", "deliveryStatus");
CREATE INDEX IF NOT EXISTS "EmailRecipient_userId_readAt_idx" ON "EmailRecipient"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "EmailRecipient_userId_pinned_idx" ON "EmailRecipient"("userId", "pinned");
CREATE INDEX IF NOT EXISTS "EmailRecipient_email_idx" ON "EmailRecipient"("email");
CREATE INDEX IF NOT EXISTS "EmailRecipient_registrationId_idx" ON "EmailRecipient"("registrationId");
CREATE INDEX IF NOT EXISTS "EmailRecipient_deliverySource_idx" ON "EmailRecipient"("deliverySource");

CREATE INDEX IF NOT EXISTS "SavedAudience_organizationId_idx" ON "SavedAudience"("organizationId");

CREATE INDEX IF NOT EXISTS "EmailAuditLog_organizationId_createdAt_idx" ON "EmailAuditLog"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailAuditLog_targetType_targetId_idx" ON "EmailAuditLog"("targetType", "targetId");

CREATE INDEX IF NOT EXISTS "ScanEvent_registrationId_idx" ON "ScanEvent"("registrationId");
CREATE INDEX IF NOT EXISTS "ScanEvent_campId_idx" ON "ScanEvent"("campId");
CREATE INDEX IF NOT EXISTS "ScanEvent_timestamp_idx" ON "ScanEvent"("timestamp");

CREATE INDEX IF NOT EXISTS "SignupLinkClick_signupLinkId_idx" ON "SignupLinkClick"("signupLinkId");
CREATE INDEX IF NOT EXISTS "SignupLinkClick_clickedAt_idx" ON "SignupLinkClick"("clickedAt");

CREATE INDEX IF NOT EXISTS "StaffSignupLinkClick_staffSignupLinkId_idx" ON "StaffSignupLinkClick"("staffSignupLinkId");
CREATE INDEX IF NOT EXISTS "StaffSignupLinkClick_clickedAt_idx" ON "StaffSignupLinkClick"("clickedAt");

-- ── 4. Foreign keys ─────────────────────────────────────────────────────────
-- Postgres has no `ADD CONSTRAINT IF NOT EXISTS`; guard each with a DO block.

DO $$ BEGIN
  ALTER TABLE "TeacherCampusQuota" ADD CONSTRAINT "TeacherCampusQuota_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TeacherCampusQuota" ADD CONSTRAINT "TeacherCampusQuota_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TribeAllocationLog" ADD CONSTRAINT "TribeAllocationLog_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TribeAllocationLog" ADD CONSTRAINT "TribeAllocationLog_tribeId_fkey" FOREIGN KEY ("tribeId") REFERENCES "Tribe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TribeAllocationLog" ADD CONSTRAINT "TribeAllocationLog_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_savedAudienceId_fkey" FOREIGN KEY ("savedAudienceId") REFERENCES "SavedAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EmailRecipient" ADD CONSTRAINT "EmailRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SavedAudience" ADD CONSTRAINT "SavedAudience_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SignupLinkClick" ADD CONSTRAINT "SignupLinkClick_signupLinkId_fkey" FOREIGN KEY ("signupLinkId") REFERENCES "SignupLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "StaffSignupLinkClick" ADD CONSTRAINT "StaffSignupLinkClick_staffSignupLinkId_fkey" FOREIGN KEY ("staffSignupLinkId") REFERENCES "StaffSignupLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SideEffect.campaignId existed as a plain column with nowhere valid to
-- point (EmailCampaign didn't exist); now that it does, add the FK.
DO $$ BEGIN
  ALTER TABLE "SideEffect" ADD CONSTRAINT "SideEffect_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Registration.suggestedTribeId is a second, named relation to Tribe
-- (distinct from the existing tribeId relation).
DO $$ BEGIN
  ALTER TABLE "Registration" ADD CONSTRAINT "Registration_suggestedTribeId_fkey" FOREIGN KEY ("suggestedTribeId") REFERENCES "Tribe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. New indexes on existing tables tied to this drift ───────────────────
-- (SideEffect already has @@index([campaignId]) and @@index([recipientEmail])
-- in schema.prisma; these were also never created by any migration.)

CREATE INDEX IF NOT EXISTS "SideEffect_campaignId_idx" ON "SideEffect"("campaignId");
CREATE INDEX IF NOT EXISTS "SideEffect_recipientEmail_idx" ON "SideEffect"("recipientEmail");
