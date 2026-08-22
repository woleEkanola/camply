-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "autoAbsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "AttendanceSession" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "ScoreEvent" ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "StaffAttendanceRecord" ADD COLUMN     "autoAbsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "ScoreEvent_campId_voidedAt_idx" ON "ScoreEvent"("campId", "voidedAt");

