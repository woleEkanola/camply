ALTER TABLE "Organization" ADD COLUMN "approvalWorkflow" TEXT NOT NULL DEFAULT 'SINGLE_STEP';

ALTER TABLE "Camper" ADD COLUMN "parentPhone" TEXT;
ALTER TABLE "Camper" ADD COLUMN "teenPhone" TEXT;
ALTER TABLE "Camper" ADD COLUMN "homeAddressStreet" TEXT;
ALTER TABLE "Camper" ADD COLUMN "homeAddressCity" TEXT;
ALTER TABLE "Camper" ADD COLUMN "homeAddressState" TEXT;
ALTER TABLE "Camper" ADD COLUMN "homeAddressZip" TEXT;

ALTER TABLE "Registration" ADD COLUMN "communicationLog" JSONB;
ALTER TABLE "Registration" ADD COLUMN "fieldChangeLog" JSONB;
