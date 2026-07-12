-- Add slug column to Organization (optional, set by org owner via UI)
ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;

-- Backfill slugs for existing organizations using PostgreSQL's regex replace
UPDATE "Organization"
SET "slug" = regexp_replace(
    regexp_replace(lower(name), '[^a-z0-9\-]+', '-', 'g'),
    '^-+|-+$', '', 'g'
)
WHERE "slug" IS NULL;

-- Partial unique index: only non-null slugs must be unique
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug") WHERE "slug" IS NOT NULL;
