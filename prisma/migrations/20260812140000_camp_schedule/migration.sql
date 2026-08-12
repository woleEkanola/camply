-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleEventKind" AS ENUM ('TIMED', 'MILESTONE');

-- CreateTable
CREATE TABLE "CampSchedule" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "reminderMinutes" INTEGER[] DEFAULT ARRAY[5, 3, 2]::INTEGER[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceMetadata" JSONB,
    "publishMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampScheduleEvent" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "eventDate" DATE NOT NULL,
    "kind" "ScheduleEventKind" NOT NULL DEFAULT 'TIMED',
    "title" TEXT NOT NULL,
    "facilitator" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "plannedEnd" TIMESTAMP(3),
    "effectiveStart" TIMESTAMP(3) NOT NULL,
    "effectiveEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampScheduleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampScheduleChange" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "eventId" TEXT,
    "actorId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "minuteDelta" INTEGER,
    "beforeState" JSONB,
    "afterState" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampScheduleChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampSchedule_campId_status_idx" ON "CampSchedule"("campId", "status");

-- CreateIndex
CREATE INDEX "CampScheduleEvent_scheduleId_dayNumber_idx" ON "CampScheduleEvent"("scheduleId", "dayNumber");

-- CreateIndex
CREATE INDEX "CampScheduleEvent_scheduleId_sortOrder_idx" ON "CampScheduleEvent"("scheduleId", "sortOrder");

-- CreateIndex
CREATE INDEX "CampScheduleChange_scheduleId_createdAt_idx" ON "CampScheduleChange"("scheduleId", "createdAt");

-- AddForeignKey
ALTER TABLE "CampSchedule" ADD CONSTRAINT "CampSchedule_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampScheduleEvent" ADD CONSTRAINT "CampScheduleEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CampSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampScheduleChange" ADD CONSTRAINT "CampScheduleChange_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CampSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampScheduleChange" ADD CONSTRAINT "CampScheduleChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CampScheduleEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
