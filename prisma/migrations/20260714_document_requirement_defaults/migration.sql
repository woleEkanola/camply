-- AlterTable: change defaults for DocumentRequirement
ALTER TABLE "DocumentRequirement" ALTER COLUMN "acceptedFormats" SET DEFAULT 'jpg,png';
ALTER TABLE "DocumentRequirement" ALTER COLUMN "maxSizeMb" SET DEFAULT 2;

-- Backfill existing non-deleted document requirements to the new defaults
UPDATE "DocumentRequirement"
SET "acceptedFormats" = 'jpg,png',
    "maxSizeMb" = 2
WHERE "deletedAt" IS NULL
  AND ("acceptedFormats" = 'pdf,jpg,png,webp' OR "maxSizeMb" = 10);
