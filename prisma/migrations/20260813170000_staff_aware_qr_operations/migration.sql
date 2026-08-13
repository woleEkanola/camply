-- Additive-only staff-aware QR operations. Existing camper attendance,
-- meals, scans, and scored sessions remain valid and unchanged.
ALTER TABLE "AttendanceSession"
  ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'CAMPER';

ALTER TABLE "ScoredSession"
  ADD COLUMN "subjectAudience" TEXT;

ALTER TABLE "StaffScanEvent"
  ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "StaffScanEvent_dedupeKey_key" ON "StaffScanEvent"("dedupeKey");

CREATE TABLE "StaffAttendanceRecord" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "staffProfileId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" TEXT,
  "notes" TEXT,
  "scoreVersion" INTEGER NOT NULL DEFAULT 0,
  "scoreEventId" TEXT,
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffAttendanceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffAttendanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffAttendanceRecord_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StaffAttendanceRecord_sessionId_staffProfileId_key" ON "StaffAttendanceRecord"("sessionId", "staffProfileId");
CREATE INDEX "StaffAttendanceRecord_staffProfileId_idx" ON "StaffAttendanceRecord"("staffProfileId");
CREATE INDEX "StaffAttendanceRecord_scoreEventId_idx" ON "StaffAttendanceRecord"("scoreEventId");

CREATE TABLE "StaffMealDistribution" (
  "id" TEXT NOT NULL,
  "campId" TEXT NOT NULL,
  "staffProfileId" TEXT NOT NULL,
  "meal" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "servedById" TEXT NOT NULL,
  "servedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffMealDistribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffMealDistribution_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffMealDistribution_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StaffMealDistribution_staffProfileId_meal_date_key" ON "StaffMealDistribution"("staffProfileId", "meal", "date");
CREATE INDEX "StaffMealDistribution_campId_date_idx" ON "StaffMealDistribution"("campId", "date");
