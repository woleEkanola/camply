-- Backfill the default Camp Invitation template and EmailEventConfig for every
-- organization that does not have one yet.
--
-- This migration is idempotent: it skips organizations that already have a
-- CAMP_INVITATION config, and it reuses an existing "Camp Invitation" template
-- if one already exists for the organization.

-- Step 1: Create a default Camp Invitation template for organizations that have
-- neither a CAMP_INVITATION config nor an existing "Camp Invitation" template.
WITH created_templates AS (
  INSERT INTO "EmailTemplate" (
    "id",
    "organizationId",
    "name",
    "description",
    "subject",
    "previewText",
    "content",
    "isDefault",
    "active",
    "createdAt",
    "updatedAt"
  )
  SELECT
    gen_random_uuid(),
    o.id,
    'Camp Invitation',
    'Certificate-style invitation sent to approved campers when the org is ready — campaign-triggered, not automatic on approval. Includes hostel/room once assigned.',
    'You''re invited to {{camp_name}}!',
    'Your camp invitation and check-in details are ready.',
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"We''re excited to welcome you! Everything you need for check-in is below — see you at camp!"}]}]}'::jsonb,
    true,
    true,
    now(),
    now()
  FROM "Organization" o
  WHERE NOT EXISTS (
    SELECT 1 FROM "EmailEventConfig" eec
    WHERE eec."organizationId" = o.id AND eec.event = 'CAMP_INVITATION'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "EmailTemplate" t
    WHERE t."organizationId" = o.id AND t.name = 'Camp Invitation' AND t."deletedAt" IS NULL
  )
  RETURNING "id", "organizationId"
)
INSERT INTO "EmailEventConfig" (
  "id",
  "organizationId",
  "event",
  "templateId",
  "enabled",
  "channels",
  "recipients",
  "senderMode",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "organizationId",
  'CAMP_INVITATION',
  "id",
  false,
  '["EMAIL","IN_APP"]'::jsonb,
  '["PARENT"]'::jsonb,
  'ORG_SLUG',
  now(),
  now()
FROM created_templates;

-- Step 2: If an organization already had a "Camp Invitation" template but no
-- CAMP_INVITATION config (e.g. created manually), wire it up now.
INSERT INTO "EmailEventConfig" (
  "id",
  "organizationId",
  "event",
  "templateId",
  "enabled",
  "channels",
  "recipients",
  "senderMode",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  t."organizationId",
  'CAMP_INVITATION',
  t.id,
  false,
  '["EMAIL","IN_APP"]'::jsonb,
  '["PARENT"]'::jsonb,
  'ORG_SLUG',
  now(),
  now()
FROM "EmailTemplate" t
WHERE t.name = 'Camp Invitation'
  AND t."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EmailEventConfig" eec
    WHERE eec."templateId" = t.id AND eec.event = 'CAMP_INVITATION'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "EmailEventConfig" eec2
    WHERE eec2."organizationId" = t."organizationId" AND eec2.event = 'CAMP_INVITATION'
  );
