-- Audit: Camply schema objects added by migrations from 2026-07-16 onward.
-- Run this against the dev database to see which recent migrations have not
-- actually been applied (i.e. tables/columns/enums are missing).
--
-- How to run:
--   psql "$DATABASE_URL" -f scripts/audit-recent-migrations.sql
--
-- Rows with status = 'MISSING' mean the corresponding migration was not
-- applied or was partially rolled back. Apply missing migrations in order with:
--   npx prisma migrate deploy

WITH expected AS (
  -- Tables
  SELECT 'table' AS kind, 'EmailCampaign' AS name, NULL::text AS column_name, NULL::text AS enum_value UNION ALL
  SELECT 'table', 'EmailRecipient', NULL, NULL UNION ALL
  SELECT 'table', 'SavedAudience', NULL, NULL UNION ALL
  SELECT 'table', 'EmailAuditLog', NULL, NULL UNION ALL
  SELECT 'table', 'ScanEvent', NULL, NULL UNION ALL
  SELECT 'table', 'SignupLinkClick', NULL, NULL UNION ALL
  SELECT 'table', 'StaffSignupLinkClick', NULL, NULL UNION ALL
  SELECT 'table', 'TeacherCampusQuota', NULL, NULL UNION ALL
  SELECT 'table', 'TribeAllocationLog', NULL, NULL UNION ALL
  SELECT 'table', 'DocumentAction', NULL, NULL UNION ALL
  -- Enums
  SELECT 'enum', 'OtpPurpose', NULL, 'LOGIN' UNION ALL
  SELECT 'enum', 'OtpPurpose', NULL, 'PASSWORD_RESET' UNION ALL
  SELECT 'enum', 'OtpPurpose', NULL, 'STAFF_SIGNUP' UNION ALL
  SELECT 'enum', 'ProfileFieldType', NULL, 'PHONE' UNION ALL
  -- Columns
  SELECT 'column', 'EmailEventConfig', 'senderMode', NULL UNION ALL
  SELECT 'column', 'EmailEventConfig', 'customFromLocalPart', NULL UNION ALL
  SELECT 'column', 'EmailEventConfig', 'replyTo', NULL UNION ALL
  SELECT 'column', 'Broadcast', 'senderMode', NULL UNION ALL
  SELECT 'column', 'Broadcast', 'customFromLocalPart', NULL UNION ALL
  SELECT 'column', 'Broadcast', 'replyTo', NULL UNION ALL
  SELECT 'column', 'BroadcastRecipient', 'pinned', NULL UNION ALL
  SELECT 'column', 'BroadcastRecipient', 'readAt', NULL UNION ALL
  SELECT 'column', 'EmailCampaign', 'personalizeCampId', NULL UNION ALL
  SELECT 'column', 'EmailCampaign', 'personalizeEvent', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'footerCopyright', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'linkedinUrl', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'nextSteps', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'phone', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'supportDescription', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'supportTitle', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'tagline', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'xUrl', NULL UNION ALL
  SELECT 'column', 'EmailTemplate', 'includeIdCard', NULL UNION ALL
  SELECT 'column', 'OrganizationBranding', 'idCardEnabled', NULL UNION ALL
  SELECT 'column', 'EmailRecipient', 'organizationId', NULL UNION ALL
  SELECT 'column', 'SideEffect', 'organizationId', NULL UNION ALL
  SELECT 'column', 'OTP', 'purpose', NULL UNION ALL
  SELECT 'column', 'SignupLink', 'quota', NULL UNION ALL
  SELECT 'column', 'SignupLink', 'quotaFullBehavior', NULL UNION ALL
  SELECT 'column', 'Registration', 'checkedOutById', NULL UNION ALL
  SELECT 'column', 'Registration', 'checkoutCollectorName', NULL UNION ALL
  SELECT 'column', 'Registration', 'checkoutCollectorRelationship', NULL UNION ALL
  SELECT 'column', 'Registration', 'checkoutDetails', NULL UNION ALL
  SELECT 'column', 'Camper', 'medicalProfile', NULL UNION ALL
  SELECT 'column', 'Camp', 'targetTribeSize', NULL UNION ALL
  SELECT 'column', 'Camp', 'tribeAllocationPresets', NULL UNION ALL
  SELECT 'column', 'Registration', 'isTribeLocked', NULL UNION ALL
  SELECT 'column', 'Registration', 'suggestedTribeId', NULL UNION ALL
  SELECT 'column', 'Registration', 'tribeSuggestedAt', NULL UNION ALL
  SELECT 'column', 'Registration', 'tribeRecommendationStatus', NULL UNION ALL
  SELECT 'column', 'Registration', 'tribeRecommendationReason', NULL UNION ALL
  SELECT 'column', 'Registration', 'tribeRecommendationScore', NULL UNION ALL
  SELECT 'column', 'Registration', 'tribeRecommendationBreakdown', NULL UNION ALL
  SELECT 'column', 'Registration', 'tribeOriginalSuggestedId', NULL UNION ALL
  SELECT 'column', 'Tribe', 'isAllocationLocked', NULL UNION ALL
  SELECT 'column', 'SideEffect', 'campaignId', NULL UNION ALL
  SELECT 'column', 'SideEffect', 'deliverySource', NULL UNION ALL
  SELECT 'column', 'SideEffect', 'recipientEmail', NULL UNION ALL
  SELECT 'column', 'SideEffect', 'recipientType', NULL UNION ALL
  SELECT 'column', 'SideEffect', 'txId', NULL
),
tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
),
columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
),
enums AS (
  SELECT t.typname AS enum_name, e.enumlabel AS enum_value
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
)
SELECT
  e.kind,
  e.name AS object,
  e.column_name AS column_or_value,
  CASE
    WHEN e.kind = 'table' THEN
      CASE WHEN t.table_name IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
    WHEN e.kind = 'column' THEN
      CASE WHEN c.column_name IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
    WHEN e.kind = 'enum' THEN
      CASE WHEN en.enum_value IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
  END AS status
FROM expected e
LEFT JOIN tables t ON e.kind = 'table' AND e.name = t.table_name
LEFT JOIN columns c ON e.kind = 'column' AND e.name = c.table_name AND e.column_name = c.column_name
LEFT JOIN enums en ON e.kind = 'enum' AND e.name = en.enum_name AND e.enum_value = en.enum_value
ORDER BY
  CASE WHEN e.kind = 'table' THEN 1 WHEN e.kind = 'enum' THEN 2 ELSE 3 END,
  e.name,
  e.column_name,
  e.enum_value;
