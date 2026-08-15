-- Additive tribe leadership seats. Existing assignedTribeId and monitor flags
-- remain in place for rolling-deploy compatibility.
ALTER TABLE "Tribe"
  ADD COLUMN "maleHeadId" TEXT,
  ADD COLUMN "femaleHeadId" TEXT,
  ADD COLUMN "maleCamperLeaderId" TEXT,
  ADD COLUMN "femaleCamperLeaderId" TEXT;

CREATE INDEX "Tribe_maleHeadId_idx" ON "Tribe"("maleHeadId");
CREATE INDEX "Tribe_femaleHeadId_idx" ON "Tribe"("femaleHeadId");
CREATE INDEX "Tribe_maleCamperLeaderId_idx" ON "Tribe"("maleCamperLeaderId");
CREATE INDEX "Tribe_femaleCamperLeaderId_idx" ON "Tribe"("femaleCamperLeaderId");

ALTER TABLE "Tribe" ADD CONSTRAINT "Tribe_maleHeadId_fkey"
  FOREIGN KEY ("maleHeadId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tribe" ADD CONSTRAINT "Tribe_femaleHeadId_fkey"
  FOREIGN KEY ("femaleHeadId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tribe" ADD CONSTRAINT "Tribe_maleCamperLeaderId_fkey"
  FOREIGN KEY ("maleCamperLeaderId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tribe" ADD CONSTRAINT "Tribe_femaleCamperLeaderId_fkey"
  FOREIGN KEY ("femaleCamperLeaderId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
