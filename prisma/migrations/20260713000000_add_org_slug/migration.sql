-- Add slug column to Organization
ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;

-- Backfill slugs for existing organizations using PostgreSQL's regex replace
UPDATE "Organization"
SET "slug" = regexp_replace(
    regexp_replace(lower(name), '[^a-z0-9\-]+', '-', 'g'),
    '^-+|-+$', '', 'g'
)
WHERE "slug" IS NULL;

-- Now make it NOT NULL and unique
ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_slug_key" UNIQUE ("slug");
