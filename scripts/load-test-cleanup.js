/**
 * load-test-cleanup.js
 * Removes everything created by load-test-seed.js / load-test-run.js:
 * scan events, meal distributions, registrations, campers, staff profiles,
 * and volunteer users tagged LOADTEST-. Reads .loadtest-fixtures.json for
 * exact IDs (falls back to email/name-prefix matching if the manifest is
 * missing) and deletes the manifest + report files afterward.
 *
 * Usage: node scripts/load-test-cleanup.js
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const manifestPath = path.join(__dirname, "..", ".loadtest-fixtures.json");
const reportPath = path.join(__dirname, "..", ".loadtest-report.json");

async function main() {
  let regIds = [];
  let camperIds = [];
  let stationEmails = [];

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    regIds = manifest.registrations.map((r) => r.id);
    camperIds = manifest.registrations.map((r) => r.camperId);
    stationEmails = manifest.stations.map((s) => s.email);
  } else {
    console.log("No manifest found — falling back to name/email prefix matching.");
    const regs = await prisma.registration.findMany({
      where: { registrationNumber: { startsWith: "LOADTEST-" } },
      select: { id: true, camperId: true },
    });
    regIds = regs.map((r) => r.id);
    camperIds = regs.map((r) => r.camperId);
    const stationUsers = await prisma.user.findMany({ where: { email: { startsWith: "loadtest-volunteer-" } }, select: { email: true } });
    stationEmails = stationUsers.map((u) => u.email);
  }

  console.log(`Deleting fixtures for ${regIds.length} registrations, ${stationEmails.length} station users...`);

  const scanEventsDeleted = await prisma.scanEvent.deleteMany({ where: { registrationId: { in: regIds } } });
  const mealsDeleted = await prisma.mealDistribution.deleteMany({ where: { registrationId: { in: regIds } } });
  const auditLogsDeleted = await prisma.auditLog.deleteMany({ where: { registrationId: { in: regIds } } });
  const regsDeleted = await prisma.registration.deleteMany({ where: { id: { in: regIds } } });
  const campersDeleted = await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });

  const stationUsers = await prisma.user.findMany({ where: { email: { in: stationEmails } }, select: { id: true } });
  const stationUserIds = stationUsers.map((u) => u.id);
  const staffProfilesDeleted = await prisma.staffProfile.deleteMany({ where: { userId: { in: stationUserIds } } });
  const stationScanEventsDeleted = await prisma.scanEvent.deleteMany({ where: { volunteerId: { in: stationUserIds } } });
  const usersDeleted = await prisma.user.deleteMany({ where: { id: { in: stationUserIds } } });

  console.log({
    scanEventsDeleted: scanEventsDeleted.count,
    stationScanEventsDeleted: stationScanEventsDeleted.count,
    mealsDeleted: mealsDeleted.count,
    auditLogsDeleted: auditLogsDeleted.count,
    regsDeleted: regsDeleted.count,
    campersDeleted: campersDeleted.count,
    staffProfilesDeleted: staffProfilesDeleted.count,
    usersDeleted: usersDeleted.count,
  });

  for (const p of [manifestPath, reportPath]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log("Cleanup complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
