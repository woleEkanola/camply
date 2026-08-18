-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "attendanceIntent" TEXT NOT NULL DEFAULT 'COMING',
ADD COLUMN "attendanceNote" TEXT,
ADD COLUMN "attendanceUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN "attendanceIntent" TEXT NOT NULL DEFAULT 'COMING',
ADD COLUMN "attendanceNote" TEXT,
ADD COLUMN "attendanceUpdatedAt" TIMESTAMP(3);
