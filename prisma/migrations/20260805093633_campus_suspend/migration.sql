-- AlterTable: add new columns first, so we can still read the old "active"
-- column below to compute its inverse before it's dropped.
ALTER TABLE "Campus" ADD COLUMN     "suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedById" TEXT,
ADD COLUMN     "suspendedReason" TEXT;

-- Data migration: suspended is the inverse of the old active flag (active
-- was never toggleable from any UI, so in practice every row is currently
-- true here — but migrate correctly in case any row was set false via import).
UPDATE "Campus" SET "suspended" = NOT "active";

-- AlterTable: drop the old, now-fully-superseded columns. signupOpen was a
-- second, equally orphaned duplicate of the same "is this campus accepting
-- activity" gate (validation.ts checked both on the same line) — dropped
-- here rather than left behind as more dead weight.
ALTER TABLE "Campus" DROP COLUMN "active",
DROP COLUMN "signupOpen";
