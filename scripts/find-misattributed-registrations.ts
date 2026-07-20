/**
 * One-off script to identify registrations misattributed to a wrong campus.
 *
 * It checks each registration against the user's `SignupLinkClick` history.
 * If a user clicked a signup link for Campus A, but their registration was created
 * under Campus B (e.g., due to the fallback bug), this script reports it.
 *
 * Usage:
 *   npx ts-node scripts/find-misattributed-registrations.ts [optionalCampusIdOrSlug]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const targetFilter = process.argv[2];

  let targetCampusId: string | null = null;
  if (targetFilter) {
    const campus = await prisma.campus.findFirst({
      where: {
        OR: [{ id: targetFilter }, { slug: targetFilter }],
      },
    });
    if (campus) {
      targetCampusId = campus.id;
      console.log(`Filtering for registrations currently on campus: ${campus.name} (${campus.id})`);
    } else {
      console.log(`Target campus "${targetFilter}" not found. Searching across all campuses.`);
    }
  }

  console.log("Analyzing registrations and signup link clicks...\n");

  const registrations = await prisma.registration.findMany({
    where: {
      deletedAt: null,
      ...(targetCampusId ? { campusId: targetCampusId } : {}),
    },
    include: {
      camper: {
        include: {
          user: true,
        },
      },
      campus: true,
      camp: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const misattributed = [];

  for (const reg of registrations) {
    const userId = reg.camper.userId;
    if (!userId) continue;

    // Find signup link clicks for this user
    const clicks = await prisma.signupLinkClick.findMany({
      where: { userId },
      include: {
        signupLink: {
          include: {
            campus: true,
            camp: true,
          },
        },
      },
      orderBy: { clickedAt: "asc" },
    });

    if (clicks.length === 0) continue;

    // Look for clicks prior to or at registration creation
    const relevantClick = clicks.find((c) => c.clickedAt <= new Date(reg.createdAt.getTime() + 60 * 1000));
    const earliestClick = relevantClick ?? clicks[0];

    const clickedCampusId = earliestClick.signupLink.campusId;
    const clickedCampusName = earliestClick.signupLink.campus?.name ?? "Unknown";

    if (clickedCampusId !== reg.campusId) {
      misattributed.push({
        registrationId: reg.id,
        registrationNumber: reg.registrationNumber ?? "N/A",
        camperName: reg.camper.name,
        parentEmail: reg.camper.user?.email ?? "N/A",
        currentCampus: reg.campus.name,
        currentCampusId: reg.campusId,
        originalClickedCampus: clickedCampusName,
        originalClickedCampusId: clickedCampusId,
        clickedAt: earliestClick.clickedAt.toISOString(),
        registeredAt: reg.createdAt.toISOString(),
      });
    }
  }

  if (misattributed.length === 0) {
    console.log("✅ No misattributed registrations found (click-based check).");
  } else {
    console.log(`🚨 Found ${misattributed.length} misattributed registration(s) (click-based check):\n`);
    console.table(misattributed);
  }

  // ── Pass 2: family-cluster heuristic ─────────────────────────────────────
  // Click logging only started recently, so registrations created BEFORE that
  // have no click rows and are invisible to the check above. Fallback: a
  // family is locked to one campus — any user whose campers' registrations
  // span multiple campuses within the same camp is a misrouting suspect.
  console.log("\nRunning family-cluster check (catches pre-click-logging registrations)...\n");

  const familyMap = new Map<string, { campusIds: Set<string>; regs: typeof registrations }>();
  for (const reg of registrations) {
    const userId = reg.camper.userId;
    if (!userId) continue;
    const key = `${userId}:${reg.campId}`;
    let entry = familyMap.get(key);
    if (!entry) {
      entry = { campusIds: new Set(), regs: [] };
      familyMap.set(key, entry);
    }
    entry.campusIds.add(reg.campusId);
    entry.regs.push(reg);
  }

  const familySuspects = [];
  for (const [, entry] of familyMap) {
    if (entry.campusIds.size <= 1) continue;
    for (const reg of entry.regs) {
      familySuspects.push({
        registrationId: reg.id,
        registrationNumber: reg.registrationNumber ?? "N/A",
        camperName: reg.camper.name,
        parentEmail: reg.camper.user?.email ?? "N/A",
        campus: reg.campus.name,
        camp: reg.camp.name,
        registeredAt: reg.createdAt.toISOString(),
      });
    }
  }

  if (familySuspects.length === 0) {
    console.log("✅ No multi-campus families found.");
  } else {
    console.log(`🚨 Found ${familySuspects.length} registration(s) in families split across campuses:\n`);
    console.table(familySuspects);
  }

  if (misattributed.length > 0 || familySuspects.length > 0) {
    console.log("\nTo reassign these registrations, you can use the admin bulk reassign feature in the UI or execute a script.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
