-- DropIndex
DROP INDEX "Bed_roomId_label_key";

-- DropIndex
DROP INDEX "Camp_organizationId_name_key";

-- DropIndex
DROP INDEX "Camp_organizationId_slug_key";

-- DropIndex
DROP INDEX "Campus_organizationId_name_key";

-- DropIndex
DROP INDEX "Department_organizationId_campId_name_key";

-- DropIndex
DROP INDEX "FormField_organizationId_audience_name_key";

-- DropIndex
DROP INDEX "Hostel_venueId_name_key";

-- DropIndex
DROP INDEX "Registration_camperId_campId_key";

-- DropIndex
DROP INDEX "Room_hostelId_name_key";

-- DropIndex
DROP INDEX "StaffProfile_userId_campId_key";

-- DropIndex
DROP INDEX "Tribe_campId_name_key";

-- DropIndex
DROP INDEX "Venue_campId_name_key";

-- AlterTable
ALTER TABLE "Bed" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Camp" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Camper" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Campus" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DocumentRequirement" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FormField" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Hostel" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tribe" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Bed_roomId_label_idx" ON "Bed"("roomId", "label");

-- CreateIndex
CREATE INDEX "Bed_deletedAt_idx" ON "Bed"("deletedAt");

-- CreateIndex
CREATE INDEX "Camp_organizationId_name_idx" ON "Camp"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Camp_organizationId_slug_idx" ON "Camp"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Camp_deletedAt_idx" ON "Camp"("deletedAt");

-- CreateIndex
CREATE INDEX "Camper_deletedAt_idx" ON "Camper"("deletedAt");

-- CreateIndex
CREATE INDEX "Campus_organizationId_name_idx" ON "Campus"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Campus_deletedAt_idx" ON "Campus"("deletedAt");

-- CreateIndex
CREATE INDEX "Department_organizationId_campId_name_idx" ON "Department"("organizationId", "campId", "name");

-- CreateIndex
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE INDEX "DocumentRequirement_deletedAt_idx" ON "DocumentRequirement"("deletedAt");

-- CreateIndex
CREATE INDEX "FormField_organizationId_audience_name_idx" ON "FormField"("organizationId", "audience", "name");

-- CreateIndex
CREATE INDEX "FormField_deletedAt_idx" ON "FormField"("deletedAt");

-- CreateIndex
CREATE INDEX "Hostel_venueId_name_idx" ON "Hostel"("venueId", "name");

-- CreateIndex
CREATE INDEX "Hostel_deletedAt_idx" ON "Hostel"("deletedAt");

-- CreateIndex
CREATE INDEX "Registration_camperId_campId_idx" ON "Registration"("camperId", "campId");

-- CreateIndex
CREATE INDEX "Registration_deletedAt_idx" ON "Registration"("deletedAt");

-- CreateIndex
CREATE INDEX "Room_hostelId_name_idx" ON "Room"("hostelId", "name");

-- CreateIndex
CREATE INDEX "Room_deletedAt_idx" ON "Room"("deletedAt");

-- CreateIndex
CREATE INDEX "StaffProfile_userId_campId_idx" ON "StaffProfile"("userId", "campId");

-- CreateIndex
CREATE INDEX "StaffProfile_deletedAt_idx" ON "StaffProfile"("deletedAt");

-- CreateIndex
CREATE INDEX "Tribe_campId_name_idx" ON "Tribe"("campId", "name");

-- CreateIndex
CREATE INDEX "Tribe_deletedAt_idx" ON "Tribe"("deletedAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Venue_campId_name_idx" ON "Venue"("campId", "name");

-- CreateIndex
CREATE INDEX "Venue_deletedAt_idx" ON "Venue"("deletedAt");

-- Partial unique indexes: enforce the original natural-key uniqueness only among
-- live (non-soft-deleted) rows, so an entity can be recreated with the same
-- natural key after a prior one was soft-deleted, without a permanent collision.
CREATE UNIQUE INDEX "Campus_organizationId_name_live_key" ON "Campus"("organizationId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Venue_campId_name_live_key" ON "Venue"("campId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Camp_organizationId_name_live_key" ON "Camp"("organizationId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Camp_organizationId_slug_live_key" ON "Camp"("organizationId", "slug") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Registration_camperId_campId_live_key" ON "Registration"("camperId", "campId") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "StaffProfile_userId_campId_live_key" ON "StaffProfile"("userId", "campId") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Tribe_campId_name_live_key" ON "Tribe"("campId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Department_organizationId_campId_name_live_key" ON "Department"("organizationId", "campId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Hostel_venueId_name_live_key" ON "Hostel"("venueId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Room_hostelId_name_live_key" ON "Room"("hostelId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Bed_roomId_label_live_key" ON "Bed"("roomId", "label") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "FormField_organizationId_audience_name_live_key" ON "FormField"("organizationId", "audience", "name") WHERE "deletedAt" IS NULL;

