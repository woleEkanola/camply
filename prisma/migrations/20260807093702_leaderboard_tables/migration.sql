-- Camp Leaderboard & Scoring System — additive only. New nullable columns on
-- AttendanceSession/AuditLog/Notification/SideEffect, new indexes on
-- Registration/AttendanceRecord (see the leaderboard_enum migration's sibling
-- schema comments), and 8 new tables. Nothing dropped, renamed, or narrowed.
-- Partial unique indexes on LeaderboardStat ship in a separate raw-SQL
-- migration (a plain composite unique can't express its nullable-day
-- semantics). Category/achievement seeds and the TribePointsLog backfill are
-- separate data-only migrations, per the backward-compatibility rule.

-- AlterTable
ALTER TABLE "AttendanceSession" ADD COLUMN     "scoredSessionId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "device" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "subjectType" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT;

-- AlterTable
ALTER TABLE "SideEffect" ADD COLUMN     "payload" JSONB;

-- CreateTable
CREATE TABLE "ScoreEvent" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "campusId" TEXT,
    "tribeId" TEXT,
    "registrationId" TEXT,
    "staffProfileId" TEXT,
    "categoryId" TEXT NOT NULL,
    "ruleId" TEXT,
    "scoredSessionId" TEXT,
    "points" INTEGER NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "source" "ScoreSource" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" DATE NOT NULL,
    "createdById" TEXT,
    "idempotencyKey" TEXT,
    "reversesEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreCategory" (
    "id" TEXT NOT NULL,
    "campId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "defaultPoints" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'BOTH',
    "isPenalty" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreRule" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "stationId" TEXT,
    "subject" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "tiers" JSONB,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxPerDay" INTEGER,
    "maxPointsPerDay" INTEGER,
    "minPoints" INTEGER,
    "maxPoints" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoredSession" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateCutoff" TIMESTAMP(3),
    "stationId" TEXT,
    "tribeId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'CAMP',
    "categoryId" TEXT NOT NULL,
    "ruleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoredSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementDefinition" (
    "id" TEXT NOT NULL,
    "campId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "subjectType" TEXT NOT NULL,
    "criteria" JSONB,
    "points" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementAward" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "awardedById" TEXT,

    CONSTRAINT "AchievementAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardStat" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "day" DATE,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "rankDelta" INTEGER,
    "attendancePct" DOUBLE PRECISION,
    "promptnessPct" DOUBLE PRECISION,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "achievementCount" INTEGER NOT NULL DEFAULT 0,
    "avgScoreToday" DOUBLE PRECISION,
    "campersPresent" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardSettings" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "publicEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publicToken" TEXT,
    "refreshIntervalSeconds" INTEGER NOT NULL DEFAULT 30,
    "showTribes" BOOLEAN NOT NULL DEFAULT true,
    "showCampers" BOOLEAN NOT NULL DEFAULT true,
    "showTeachers" BOOLEAN NOT NULL DEFAULT true,
    "showCampuses" BOOLEAN NOT NULL DEFAULT false,
    "showAchievements" BOOLEAN NOT NULL DEFAULT true,
    "camperMetricWeights" JSONB,
    "teacherMetricWeights" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "lastRebuildAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoreEvent_idempotencyKey_key" ON "ScoreEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScoreEvent_campId_day_idx" ON "ScoreEvent"("campId", "day");

-- CreateIndex
CREATE INDEX "ScoreEvent_campId_tribeId_day_idx" ON "ScoreEvent"("campId", "tribeId", "day");

-- CreateIndex
CREATE INDEX "ScoreEvent_campId_registrationId_day_idx" ON "ScoreEvent"("campId", "registrationId", "day");

-- CreateIndex
CREATE INDEX "ScoreEvent_campId_staffProfileId_day_idx" ON "ScoreEvent"("campId", "staffProfileId", "day");

-- CreateIndex
CREATE INDEX "ScoreEvent_campId_createdAt_idx" ON "ScoreEvent"("campId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreEvent_campId_categoryId_day_idx" ON "ScoreEvent"("campId", "categoryId", "day");

-- CreateIndex
CREATE INDEX "ScoreEvent_reversesEventId_idx" ON "ScoreEvent"("reversesEventId");

-- CreateIndex
CREATE INDEX "ScoreCategory_campId_enabled_idx" ON "ScoreCategory"("campId", "enabled");

-- CreateIndex
CREATE INDEX "ScoreCategory_campId_key_idx" ON "ScoreCategory"("campId", "key");

-- CreateIndex
CREATE INDEX "ScoreRule_campId_enabled_idx" ON "ScoreRule"("campId", "enabled");

-- CreateIndex
CREATE INDEX "ScoreRule_campId_trigger_stationId_idx" ON "ScoreRule"("campId", "trigger", "stationId");

-- CreateIndex
CREATE INDEX "ScoredSession_campId_date_idx" ON "ScoredSession"("campId", "date");

-- CreateIndex
CREATE INDEX "ScoredSession_campId_status_idx" ON "ScoredSession"("campId", "status");

-- CreateIndex
CREATE INDEX "AchievementDefinition_campId_enabled_idx" ON "AchievementDefinition"("campId", "enabled");

-- CreateIndex
CREATE INDEX "AchievementAward_campId_awardedAt_idx" ON "AchievementAward"("campId", "awardedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementAward_definitionId_subjectKey_key" ON "AchievementAward"("definitionId", "subjectKey");

-- CreateIndex
CREATE INDEX "LeaderboardStat_campId_subjectType_day_totalPoints_idx" ON "LeaderboardStat"("campId", "subjectType", "day", "totalPoints");

-- CreateIndex
CREATE INDEX "LeaderboardStat_campId_subjectType_subjectId_day_idx" ON "LeaderboardStat"("campId", "subjectType", "subjectId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardSettings_campId_key" ON "LeaderboardSettings"("campId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardSettings_publicToken_key" ON "LeaderboardSettings"("publicToken");

-- CreateIndex
CREATE INDEX "AttendanceRecord_registrationId_idx" ON "AttendanceRecord"("registrationId");

-- CreateIndex
CREATE INDEX "AttendanceSession_campId_date_idx" ON "AttendanceSession"("campId", "date");

-- CreateIndex
CREATE INDEX "AttendanceSession_tribeId_date_idx" ON "AttendanceSession"("tribeId", "date");

-- CreateIndex
CREATE INDEX "AttendanceSession_scoredSessionId_idx" ON "AttendanceSession"("scoredSessionId");

-- CreateIndex
CREATE INDEX "AuditLog_subjectType_subjectId_idx" ON "AuditLog"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Registration_campId_tribeId_idx" ON "Registration"("campId", "tribeId");

-- CreateIndex
CREATE INDEX "SideEffect_type_status_runAfter_idx" ON "SideEffect"("type", "status", "runAfter");

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCategory" ADD CONSTRAINT "ScoreCategory_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRule" ADD CONSTRAINT "ScoreRule_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoredSession" ADD CONSTRAINT "ScoredSession_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementDefinition" ADD CONSTRAINT "AchievementDefinition_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementAward" ADD CONSTRAINT "AchievementAward_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AchievementDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardSettings" ADD CONSTRAINT "LeaderboardSettings_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

