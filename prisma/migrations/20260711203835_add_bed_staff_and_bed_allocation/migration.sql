-- AlterTable
ALTER TABLE "Bed" ADD COLUMN     "staffProfileId" TEXT;

-- AlterTable
ALTER TABLE "Camp" ADD COLUMN     "bedAllocationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bedAllocationRules" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Bed_staffProfileId_key" ON "Bed"("staffProfileId");

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

