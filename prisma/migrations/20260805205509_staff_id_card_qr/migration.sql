-- Staff (teacher/volunteer) ID card + scan identity — additive only.
-- (The auto-generated `prisma migrate diff` also produced unrelated
-- DROP/RESTORE statements for Campus.suspended/ExportJob — artifacts of this
-- shared local dev database having other in-progress branches' schema state
-- applied, which this branch's fresh `dev`-based schema.prisma doesn't
-- declare. Those statements are deliberately excluded from this migration.)

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "qrIssuedAt" TIMESTAMP(3),
ADD COLUMN     "qrToken" TEXT;

-- CreateTable
CREATE TABLE "StaffScanEvent" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "campId" TEXT,
    "station" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedById" TEXT NOT NULL,
    "device" TEXT,
    "location" TEXT,
    "result" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "StaffScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffScanEvent_staffProfileId_idx" ON "StaffScanEvent"("staffProfileId");

-- CreateIndex
CREATE INDEX "StaffScanEvent_campId_idx" ON "StaffScanEvent"("campId");

-- CreateIndex
CREATE INDEX "StaffScanEvent_timestamp_idx" ON "StaffScanEvent"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_qrToken_key" ON "StaffProfile"("qrToken");

-- AddForeignKey
ALTER TABLE "StaffScanEvent" ADD CONSTRAINT "StaffScanEvent_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffScanEvent" ADD CONSTRAINT "StaffScanEvent_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffScanEvent" ADD CONSTRAINT "StaffScanEvent_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

