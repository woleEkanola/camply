/**
 * load-test-seed.js
 * Seeds fixtures for the QR-scan volume load test:
 *   - N campers + APPROVED registrations (unique qrTokens) under the fixture
 *     org's active camp/campus
 *   - STATIONS approved VOLUNTEER staff profiles (volunteerCategory "Kitchen",
 *     so they pass both assertCanScan and assertKitchenStaffOrAdmin) to act as
 *     scanning "stations"
 *
 * Everything created here is tagged with a "LOADTEST-" prefix so
 * load-test-cleanup.js can find and remove it unambiguously.
 *
 * Usage: node scripts/load-test-seed.js [campers] [stations]
 */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
const prisma = new PrismaClient();

const CAMPER_COUNT = parseInt(process.argv[2] || "900", 10);
const STATION_COUNT = parseInt(process.argv[3] || "15", 10);
const TAG = "LOADTEST";

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
  if (!admin.organizationId) throw new Error("admin@camply.com has no organizationId");
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: admin.organizationId } });
  if (!organization.activeCampId) throw new Error("Fixture org has no active camp");
  const campId = organization.activeCampId;
  const campus = await prisma.campus.findFirstOrThrow({ where: { organizationId: organization.id } });

  console.log(`Org: ${organization.id} | Camp: ${campId} | Campus: ${campus.id}`);

  // ── Volunteer stations ──
  const passwordHash = await hash("loadtest-not-used", 4);
  const stationUserIds = [];
  for (let i = 0; i < STATION_COUNT; i++) {
    const email = `${TAG.toLowerCase()}-volunteer-${i}@camply.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: passwordHash,
        role: "VOLUNTEER",
        firstName: `${TAG} Volunteer`,
        lastName: `${i}`,
        organizationId: organization.id,
        active: true,
      },
    });
    const existingProfile = await prisma.staffProfile.findFirst({ where: { userId: user.id, organizationId: organization.id } });
    if (!existingProfile) {
      await prisma.staffProfile.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          campId,
          type: "VOLUNTEER",
          status: "APPROVED",
          firstName: `${TAG} Volunteer`,
          lastName: `${i}`,
          phone: "0000000000",
          email,
          volunteerCategory: "Kitchen",
          approvedAt: new Date(),
        },
      });
    } else if (existingProfile.status !== "APPROVED" || existingProfile.volunteerCategory !== "Kitchen") {
      await prisma.staffProfile.update({ where: { id: existingProfile.id }, data: { status: "APPROVED", volunteerCategory: "Kitchen" } });
    }
    stationUserIds.push({ userId: user.id, email });
  }
  console.log(`Stations ready: ${stationUserIds.length}`);

  // ── Campers + registrations ──
  const runTag = Date.now();
  const registrations = [];
  const BATCH = 50;
  for (let batchStart = 0; batchStart < CAMPER_COUNT; batchStart += BATCH) {
    const batchEnd = Math.min(batchStart + BATCH, CAMPER_COUNT);
    const ops = [];
    for (let i = batchStart; i < batchEnd; i++) {
      ops.push(
        prisma.camper.create({
          data: {
            name: `${TAG} Camper ${i}`,
            firstName: TAG,
            lastName: `Camper${i}`,
            gender: i % 2 === 0 ? "Male" : "Female",
            dateOfBirth: new Date(2012, 0, 1),
            userId: admin.id,
            organizationId: organization.id,
            homeCampusId: campus.id,
          },
        }).then((camper) =>
          prisma.registration.create({
            data: {
              status: "APPROVED",
              camperId: camper.id,
              campId,
              campusId: campus.id,
              registrationNumber: `${TAG}-${runTag}-${String(i).padStart(4, "0")}`,
              qrToken: `${TAG.toLowerCase()}-qr-${runTag}-${i}`,
              approvedAt: new Date(),
            },
            select: { id: true, qrToken: true, camperId: true },
          })
        )
      );
    }
    const created = await Promise.all(ops);
    registrations.push(...created);
    process.stdout.write(`\rCampers seeded: ${registrations.length}/${CAMPER_COUNT}`);
  }
  console.log("");

  const fs = require("fs");
  const path = require("path");
  const outPath = path.join(__dirname, "..", ".loadtest-fixtures.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        organizationId: organization.id,
        campId,
        campusId: campus.id,
        stations: stationUserIds,
        registrations,
        runTag,
      },
      null,
      2
    )
  );
  console.log(`Wrote fixture manifest: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
