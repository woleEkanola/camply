-- Additive-only attendance workflow expansion. Defaults preserve the old
-- attendance page's behaviour while new clients gain lifecycle and source data.
ALTER TABLE "AttendanceSession"
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "lateAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" TEXT,
  ADD COLUMN "allowVolunteerAccess" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AttendanceRecord"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedById" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "scoreVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scoreEventId" TEXT;

CREATE INDEX "AttendanceSession_status_date_idx" ON "AttendanceSession"("status", "date");
CREATE INDEX "AttendanceRecord_scoreEventId_idx" ON "AttendanceRecord"("scoreEventId");
