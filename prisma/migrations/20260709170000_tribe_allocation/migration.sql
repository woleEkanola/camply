-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "tribeAssignedAt" TIMESTAMP(3),
ADD COLUMN     "tribeAssignmentMethod" TEXT,
ADD COLUMN     "tribeId" TEXT;

-- AlterTable
ALTER TABLE "Year" ADD COLUMN     "tribeAllocationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tribeAllocationMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "tribeAllocationRules" JSONB;

-- CreateTable
CREATE TABLE "Tribe" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "maxCapacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tribe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tribe_yearId_name_key" ON "Tribe"("yearId", "name");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tribeId_fkey" FOREIGN KEY ("tribeId") REFERENCES "Tribe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tribe" ADD CONSTRAINT "Tribe_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

