#!/usr/bin/env node

/**
 * Audit recent migrations (2026-07-16 onward) by checking whether the
 * tables, columns, and enums they create are actually present in the database.
 *
 * Usage:
 *   node scripts/audit-recent-migrations.js
 *
 * Requires DATABASE_URL to be set in the environment or in .env.
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const SQL_PATH = path.join(__dirname, "audit-recent-migrations.sql");

async function main() {
  const prisma = new PrismaClient();
  try {
    const sql = fs.readFileSync(SQL_PATH, "utf-8");
    const rows = await prisma.$queryRawUnsafe(sql);

    const missing = rows.filter((r) => r.status === "MISSING");

    console.log("\n=== Recent migration schema audit ===\n");
    console.log(`Total objects checked: ${rows.length}`);
    console.log(`Missing: ${missing.length}`);
    console.log(`Present: ${rows.length - missing.length}\n`);

    if (missing.length === 0) {
      console.log("All expected schema objects are present. No action needed.\n");
      return;
    }

    console.log("MISSING objects (grouped by migration):\n");

    const byMigration = groupByMigration(missing);
    for (const [migration, items] of Object.entries(byMigration)) {
      console.log(`Migration: ${migration}`);
      for (const item of items) {
        const detail = item.column_or_value
          ? `  - ${item.kind}: ${item.object}.${item.column_or_value}`
          : `  - ${item.kind}: ${item.object}`;
        console.log(detail);
      }
      console.log("");
    }

    console.log("Run the missing migrations in order with:\n");
    console.log("  npx prisma migrate deploy\n");
    console.log("If migrate deploy skips them because of drift, see scripts/");
    console.log("mark-migration-applied.sql (create it if needed) or ask the AI");
    console.log("assistant for the drift-remediation steps.\n");

    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function groupByMigration(rows) {
  // Map the missing object to the migration that creates it.
  const map = new Map();
  for (const row of rows) {
    const migration = inferMigration(row);
    if (!map.has(migration)) map.set(migration, []);
    map.get(migration).push(row);
  }
  // Sort by migration name (chronological because of timestamp prefix).
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function inferMigration(row) {
  const { kind, object, column_or_value: col } = row;

  if (kind === "table") {
    const tableMigrations = {
      EmailCampaign: "20260719000000_repair_missing_tables",
      EmailRecipient: "20260719000000_repair_missing_tables",
      SavedAudience: "20260719000000_repair_missing_tables",
      EmailAuditLog: "20260719000000_repair_missing_tables",
      ScanEvent: "20260719000000_repair_missing_tables",
      SignupLinkClick: "20260719000000_repair_missing_tables",
      StaffSignupLinkClick: "20260719000000_repair_missing_tables",
      TeacherCampusQuota: "20260719000000_repair_missing_tables",
      TribeAllocationLog: "20260719000000_repair_missing_tables",
      DocumentAction: "20260716221212_document_action_table",
    };
    return tableMigrations[object] || "unknown";
  }

  if (kind === "enum") {
    if (object === "OtpPurpose") return "20260729000000_otp_purpose_enum / 20260729000100_otp_purpose";
    if (object === "ProfileFieldType") return "20260717_add_phone_field_type";
    return "unknown";
  }

  // Columns
  if (object === "EmailEventConfig" || object === "Broadcast") {
    return "20260717_email_sender_policy";
  }
  if (object === "BroadcastRecipient") return "20260717004400_broadcast_recipient_inbox";
  if (object === "EmailCampaign" && ["personalizeCampId", "personalizeEvent"].includes(col)) {
    return "20260725063959_camp_invitation_certificate_fields";
  }
  if (object === "OrganizationBranding" && ["tagline", "supportTitle", "supportDescription", "footerCopyright", "phone", "xUrl", "linkedinUrl", "nextSteps"].includes(col)) {
    return "20260725063959_camp_invitation_certificate_fields";
  }
  if (object === "OrganizationBranding" && col === "idCardEnabled") return "20260725074502_camp_id_card";
  if (object === "EmailTemplate" && col === "includeIdCard") return "20260725074502_camp_id_card";
  if (object === "EmailRecipient" && col === "organizationId") return "20260720_email_org_attribution";
  if (object === "SideEffect" && col === "organizationId") return "20260720_email_org_attribution";
  if (object === "OTP" && col === "purpose") return "20260729000100_otp_purpose";
  if (object === "SignupLink") return "20260716112620_signup_link_campus_quota";
  if (object === "Registration" && ["checkedOutById", "checkoutCollectorName", "checkoutCollectorRelationship", "checkoutDetails"].includes(col)) {
    return "20260717_checkin_redesign";
  }
  if (object === "Camper" && col === "medicalProfile") return "20260719000000_repair_missing_tables";
  if (object === "Camp" && ["targetTribeSize", "tribeAllocationPresets"].includes(col)) return "20260719000000_repair_missing_tables";
  if (object === "Registration" && ["isTribeLocked", "suggestedTribeId", "tribeSuggestedAt", "tribeRecommendationStatus", "tribeRecommendationReason", "tribeRecommendationScore", "tribeRecommendationBreakdown", "tribeOriginalSuggestedId"].includes(col)) {
    return "20260719000000_repair_missing_tables";
  }
  if (object === "Tribe" && col === "isAllocationLocked") return "20260719000000_repair_missing_tables";
  if (object === "SideEffect" && ["campaignId", "deliverySource", "recipientEmail", "recipientType", "txId"].includes(col)) {
    return "20260719000000_repair_missing_tables";
  }

  return "unknown";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
