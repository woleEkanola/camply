/**
 * One-off backfill: creates real Department rows from the historically
 * free-text StaffProfile.volunteerCategory field, then links each
 * StaffProfile to its matching Department via departmentId.
 *
 * Idempotent — safe to re-run: Departments are upserted by their unique key
 * and StaffProfiles that already have a departmentId are skipped.
 *
 * Run with: npx ts-node scripts/backfillDepartments.ts
 * (source .env first — ts-node does not auto-load it, see CLAUDE.md)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Historical hardcoded list (src/components/staff/StaffDetailDrawer.tsx,
// src/components/staff/RegistrationWizard.tsx) — seeded as default
// Department rows per org/year so admins have a sane starting set even
// before any volunteer picked a category.
const VOLUNTEER_CATEGORIES = [
  "Registration",
  "Medical",
  "Kitchen",
  "Transport",
  "Security",
  "Media",
  "Logistics",
  "Technical",
  "Cleaning",
  "Protocol",
];

function normalize(name: string) {
  return name.trim().toLowerCase();
}

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true } });

  let deptCreated = 0;
  let staffLinked = 0;
  let unmatched = 0;

  for (const org of organizations) {
    // Distinct (yearId, volunteerCategory) pairs actually present in data.
    const profiles = await prisma.staffProfile.findMany({
      where: { organizationId: org.id },
      select: { id: true, yearId: true, volunteerCategory: true, departmentId: true },
    });

    const yearIds = Array.from(new Set(profiles.map((p) => p.yearId)));

    for (const yearId of yearIds) {
      // Seed the default category list as Department rows for this org/year.
      const namesForYear = new Set<string>(VOLUNTEER_CATEGORIES);
      for (const p of profiles) {
        if (p.yearId === yearId && p.volunteerCategory) {
          namesForYear.add(p.volunteerCategory.trim());
        }
      }

      const nameToDept = new Map<string, string>(); // normalized name -> Department.id
      for (const name of namesForYear) {
        const dept = await prisma.department.upsert({
          where: { organizationId_yearId_name: { organizationId: org.id, yearId, name } },
          update: {},
          create: { organizationId: org.id, yearId, name },
        });
        nameToDept.set(normalize(name), dept.id);
        deptCreated++;
      }

      // Backfill departmentId for profiles in this org/year.
      for (const p of profiles) {
        if (p.yearId !== yearId) continue;
        if (p.departmentId) continue; // already linked, skip (idempotent)
        if (!p.volunteerCategory) continue;

        const deptId = nameToDept.get(normalize(p.volunteerCategory));
        if (!deptId) {
          console.warn(`[backfill] Unmatched volunteerCategory "${p.volunteerCategory}" on StaffProfile ${p.id}`);
          unmatched++;
          continue;
        }

        await prisma.staffProfile.update({ where: { id: p.id }, data: { departmentId: deptId } });
        staffLinked++;
      }
    }
  }

  console.log(`Backfill complete: ${deptCreated} department upserts, ${staffLinked} staff profiles linked, ${unmatched} unmatched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
