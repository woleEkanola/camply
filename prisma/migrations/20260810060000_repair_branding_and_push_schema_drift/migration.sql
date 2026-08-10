-- Repair objects present in schema.prisma but absent from migration history.
-- Every operation is additive and idempotent so environments with a subset
-- of these objects can deploy the migration safely.

ALTER TABLE "OrganizationBranding"
  ADD COLUMN IF NOT EXISTS "emailLogoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "idCardLogoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "masterLogoUrl" TEXT;

CREATE TABLE IF NOT EXISTS "PlatformBranding" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "platformLogoUrl" TEXT,
  "faviconUrl" TEXT,
  "pwaIcon192Url" TEXT,
  "pwaIcon512Url" TEXT,
  "appleIconUrl" TEXT,
  "emailLogoUrl" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#0D9488',
  "accentColor" TEXT NOT NULL DEFAULT '#E67E22',
  "headerImageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformBranding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "deviceId" TEXT,
  "station" TEXT,
  "browser" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebPushLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'INFO',
  "targetAudience" TEXT NOT NULL,
  "targetId" TEXT,
  "actionUrl" TEXT,
  "sentById" TEXT,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebPushLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key"
  ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx"
  ON "PushSubscription"("userId");
CREATE INDEX IF NOT EXISTS "PushSubscription_organizationId_idx"
  ON "PushSubscription"("organizationId");
CREATE INDEX IF NOT EXISTS "WebPushLog_organizationId_createdAt_idx"
  ON "WebPushLog"("organizationId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PushSubscription_userId_fkey'
      AND conrelid = '"PushSubscription"'::regclass
  ) THEN
    ALTER TABLE "PushSubscription"
      ADD CONSTRAINT "PushSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
