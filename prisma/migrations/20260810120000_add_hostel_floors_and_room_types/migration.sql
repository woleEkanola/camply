-- Additive-only accommodation structure migration. Existing rooms remain
-- STANDARD and unassigned to a floor, so the previous application build can
-- continue reading and writing them during a rolling deployment.
CREATE TYPE "RoomType" AS ENUM ('STANDARD', 'SPECIAL', 'COMMON');

CREATE TABLE "HostelFloor" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "roomNumberStart" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HostelFloor_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Room"
  ADD COLUMN "floorId" TEXT,
  ADD COLUMN "roomType" "RoomType" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "locationLabel" TEXT,
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "HostelFloor_hostelId_displayOrder_idx" ON "HostelFloor"("hostelId", "displayOrder");
CREATE INDEX "HostelFloor_deletedAt_idx" ON "HostelFloor"("deletedAt");
CREATE INDEX "Room_floorId_displayOrder_idx" ON "Room"("floorId", "displayOrder");

ALTER TABLE "HostelFloor" ADD CONSTRAINT "HostelFloor_hostelId_fkey"
  FOREIGN KEY ("hostelId") REFERENCES "Hostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey"
  FOREIGN KEY ("floorId") REFERENCES "HostelFloor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
