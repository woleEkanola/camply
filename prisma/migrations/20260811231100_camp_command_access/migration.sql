ALTER TABLE "Department" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "Position" ADD COLUMN "leadershipRole" "CampLeadershipRole";
ALTER TABLE "PositionAssignment" ADD COLUMN "accessMode" "CommandAccessMode";
ALTER TABLE "PositionAssignment" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "CampCommandPolicy" (
  "id" TEXT NOT NULL,
  "campId" TEXT NOT NULL,
  "commandantMode" "CommandAccessMode" NOT NULL DEFAULT 'FULL',
  "commandantPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "assistantDefaultMode" "CommandAccessMode" NOT NULL DEFAULT 'CUSTOM',
  "assistantDefaultPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampCommandPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampCommandPolicy_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CampCommandPolicy_campId_key" ON "CampCommandPolicy"("campId");
CREATE INDEX "Department_campId_systemKey_idx" ON "Department"("campId", "systemKey");
CREATE INDEX "Position_campId_leadershipRole_idx" ON "Position"("campId", "leadershipRole");
CREATE UNIQUE INDEX "Position_one_commandant_per_camp_key"
  ON "Position"("campId")
  WHERE "leadershipRole" = 'COMMANDANT' AND "deletedAt" IS NULL;
