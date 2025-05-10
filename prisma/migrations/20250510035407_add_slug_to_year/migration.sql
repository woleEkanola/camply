-- Step 1: Add the slug column as nullable first
ALTER TABLE "Year" ADD COLUMN "slug" TEXT;

-- Step 2: Update existing records with a slug based on the name
-- Convert spaces to hyphens, lowercase everything, and remove special characters
UPDATE "Year"
SET "slug" = LOWER(REGEXP_REPLACE(REGEXP_REPLACE("name", '[^a-zA-Z0-9 ]', '', 'g'), '\s+', '-', 'g'));

-- Step 3: Make the slug column NOT NULL after populating it
ALTER TABLE "Year" ALTER COLUMN "slug" SET NOT NULL;

-- Step 4: Create the unique index
CREATE UNIQUE INDEX "Year_organizationId_slug_key" ON "Year"("organizationId", "slug");
