-- AlterTable
ALTER TABLE "LeaderboardSettings" ADD COLUMN     "campusMetricWeights" JSONB,
ADD COLUMN     "completionMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "completionPoints" INTEGER NOT NULL DEFAULT 50;

