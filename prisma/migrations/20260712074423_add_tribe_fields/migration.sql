-- AlterTable
ALTER TABLE "Tribe" ADD COLUMN     "ageRange" TEXT,
ADD COLUMN     "allocationStrategy" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "meaning" TEXT,
ADD COLUMN     "motto" TEXT,
ADD COLUMN     "scripture" TEXT;

-- CreateIndex
CREATE INDEX "Tribe_campId_code_idx" ON "Tribe"("campId", "code");
