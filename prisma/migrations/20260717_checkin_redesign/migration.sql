-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "checkedOutById" TEXT,
ADD COLUMN "checkoutCollectorName" TEXT,
ADD COLUMN "checkoutCollectorRelationship" TEXT,
ADD COLUMN "checkoutDetails" JSONB;
