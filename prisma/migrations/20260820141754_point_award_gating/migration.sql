-- AlterTable
ALTER TABLE "LeaderboardSettings" ADD COLUMN     "restrictPointAwarding" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "canAwardPoints" BOOLEAN NOT NULL DEFAULT false;

