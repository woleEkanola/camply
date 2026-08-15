-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "jdKey" TEXT,
ADD COLUMN     "mergedIntoId" TEXT;

-- AlterTable
ALTER TABLE "PositionAssignment" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Department_campId_jdKey_idx" ON "Department"("campId", "jdKey");

-- CreateIndex
CREATE INDEX "Department_mergedIntoId_idx" ON "Department"("mergedIntoId");

-- CreateIndex
CREATE INDEX "PositionAssignment_staffId_isCurrent_isPrimary_idx" ON "PositionAssignment"("staffId", "isCurrent", "isPrimary");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

