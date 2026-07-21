-- AlterTable
ALTER TABLE "Camp" ADD COLUMN     "targetTribeSize" INTEGER,
ADD COLUMN     "tribeAllocationPresets" JSONB;

-- AlterTable
ALTER TABLE "Camper" ADD COLUMN     "medicalProfile" JSONB;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "isTribeLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Tribe" ADD COLUMN     "isAllocationLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TribeAllocationLog" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tribeId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "allocationMode" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "rulesetSnapshot" JSONB NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "reasons" JSONB NOT NULL,
    "wasOverridden" BOOLEAN NOT NULL DEFAULT false,
    "overriddenById" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TribeAllocationLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TribeAllocationLog" ADD CONSTRAINT "TribeAllocationLog_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TribeAllocationLog" ADD CONSTRAINT "TribeAllocationLog_tribeId_fkey" FOREIGN KEY ("tribeId") REFERENCES "Tribe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TribeAllocationLog" ADD CONSTRAINT "TribeAllocationLog_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

┌─────────────────────────────────────────────────────────┐
│  Update available 6.7.0 -> 7.9.0                        │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
