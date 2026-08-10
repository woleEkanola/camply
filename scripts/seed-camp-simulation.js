/** Deterministic full-camp fixture: 900 campers, 80 teachers and 840 beds. */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const CAMPERS = 900;
const APPROVED_CAMPERS = 720;
const TEACHERS = 80;
const APPROVED_TEACHERS = 60;
const TRIBES = 12;

async function main() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
  if (!admin.organizationId) throw new Error("Seed admin has no organization");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: admin.organizationId } });
  if (!org.activeCampId) throw new Error("Seed organization has no active camp");
  const campId = org.activeCampId;
  const campus = await prisma.campus.findFirstOrThrow({ where: { organizationId: org.id } });
  const venue = await prisma.venue.findFirstOrThrow({ where: { campId } });
  const password = await hash("password123", 4);
  const now = new Date();

  const tribeRows = Array.from({ length: TRIBES }, (_, i) => ({
    id: randomUUID(), campId, name: `Simulation Tribe ${String(i + 1).padStart(2, "0")}`,
    code: `SIM${String(i + 1).padStart(2, "0")}`, color: `hsl(${i * 30} 70% 45%)`,
    displayOrder: i, maxCapacity: 100,
  }));
  await prisma.tribe.createMany({ data: tribeRows });

  const teacherUsers = Array.from({ length: TEACHERS }, (_, i) => ({
    id: randomUUID(), email: `simulation.teacher.${String(i + 1).padStart(3, "0")}@camply.test`,
    password, role: "TEACHER", firstName: `Teacher${String(i + 1).padStart(3, "0")}`,
    lastName: i % 2 === 0 ? "Male" : "Female", organizationId: org.id,
    homeCampusId: campus.id, active: true,
  }));
  await prisma.user.createMany({ data: teacherUsers });
  const teacherProfiles = teacherUsers.map((u, i) => ({
    id: randomUUID(), userId: u.id, organizationId: org.id, campId, type: "TEACHER",
    status: i < APPROVED_TEACHERS ? "APPROVED" : "PENDING", firstName: u.firstName,
    lastName: u.lastName, email: u.email, phone: `08070${String(i).padStart(5, "0")}`,
    gender: i % 2 === 0 ? "MALE" : "FEMALE", preferredCampusId: campus.id,
    assignedVenueId: i < APPROVED_TEACHERS ? venue.id : null,
    approvedAt: i < APPROVED_TEACHERS ? now : null,
  }));
  await prisma.staffProfile.createMany({ data: teacherProfiles });

  const parentUsers = Array.from({ length: CAMPERS }, (_, i) => ({
    id: randomUUID(), email: `simulation.parent.${String(i + 1).padStart(4, "0")}@camply.test`,
    password, role: "PARENT", firstName: "Simulation", lastName: `Parent${String(i + 1).padStart(4, "0")}`,
    organizationId: org.id, active: true,
  }));
  await prisma.user.createMany({ data: parentUsers });
  const camperRows = Array.from({ length: CAMPERS }, (_, i) => ({
    id: randomUUID(), name: `Simulation Camper ${String(i + 1).padStart(4, "0")}`,
    firstName: "Simulation", lastName: `Camper${String(i + 1).padStart(4, "0")}`,
    gender: i % 2 === 0 ? "MALE" : "FEMALE", dateOfBirth: new Date(2011 + (i % 6), i % 12, (i % 27) + 1),
    userId: parentUsers[i].id, organizationId: org.id, homeCampusId: campus.id, active: true,
  }));
  await prisma.camper.createMany({ data: camperRows });
  const registrations = camperRows.map((c, i) => ({
    id: randomUUID(), camperId: c.id, campId, campusId: campus.id,
    venueId: i < APPROVED_CAMPERS ? venue.id : null,
    venueAssignedAt: i < APPROVED_CAMPERS ? now : null,
    status: i < APPROVED_CAMPERS ? "APPROVED" : "PENDING",
    registrationNumber: `SIM-${String(i + 1).padStart(4, "0")}`,
    qrToken: `simulation-qr-${String(i + 1).padStart(4, "0")}`,
    submittedAt: now, approvedAt: i < APPROVED_CAMPERS ? now : null,
  }));
  await prisma.registration.createMany({ data: registrations });

  const hostels = [
    { id: randomUUID(), organizationId: org.id, venueId: venue.id, name: "Simulation Boys Hostel", gender: "MALE" },
    { id: randomUUID(), organizationId: org.id, venueId: venue.id, name: "Simulation Girls Hostel", gender: "FEMALE" },
  ];
  await prisma.hostel.createMany({ data: hostels });
  const floors = hostels.flatMap((h) => [0, 1, 2].map((level) => ({
    id: randomUUID(), hostelId: h.id, name: level === 0 ? "Ground Floor" : `${level}${level === 1 ? "st" : "nd"} Floor`,
    code: level === 0 ? "G" : String(level), level, displayOrder: level,
  })));
  await prisma.hostelFloor.createMany({ data: floors });
  const rooms = hostels.flatMap((h) => Array.from({ length: 70 }, (_, i) => ({
    id: randomUUID(), hostelId: h.id, floorId: floors.find((f) => f.hostelId === h.id && f.level === Math.floor(i / 24))?.id,
    name: `${h.gender === "MALE" ? "B" : "G"}${String(i + 1).padStart(3, "0")}`,
    capacity: 6, displayOrder: i,
  })));
  await prisma.room.createMany({ data: rooms });
  await prisma.bed.createMany({ data: rooms.flatMap((r) => Array.from({ length: 6 }, (_, i) => ({
    id: randomUUID(), roomId: r.id, label: `Bed ${i + 1}`,
  }))) });

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  // `prisma db push` cannot express the partial unique indexes used by the
  // leaderboard upserts. Make this standalone local simulation reproducible
  // even when migration history was intentionally reset.
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "LeaderboardStat_camp_subject_total_key" ON "LeaderboardStat"("campId", "subjectType", "subjectId") WHERE "day" IS NULL`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "LeaderboardStat_camp_subject_day_key" ON "LeaderboardStat"("campId", "subjectType", "subjectId", "day") WHERE "day" IS NOT NULL`);
  const rule = await prisma.scoreRule.create({ data: {
    campId, categoryId: "seed-cat-attendance", trigger: "SCAN", stationId: "BREAKFAST",
    subject: "REGISTRATION", points: 5, enabled: true, priority: 100,
  }});
  await prisma.scoredSession.create({ data: {
    campId, name: "Simulation Breakfast", date: new Date(`${day}T00:00:00.000Z`),
    startsAt: new Date(now.getTime() - 10 * 60_000), stationId: "BREAKFAST",
    scope: "CAMP", categoryId: "seed-cat-attendance", ruleId: rule.id, status: "ACTIVE",
  }});

  const manifest = {
    organizationId: org.id, campId, campusId: campus.id, venueId: venue.id,
    venueName: venue.name, camperCount: CAMPERS, approvedCamperCount: APPROVED_CAMPERS,
    teacherCount: TEACHERS, approvedTeacherCount: APPROVED_TEACHERS,
    tribeIds: tribeRows.map((t) => t.id), hostelIds: hostels.map((h) => h.id),
    registrations: registrations.slice(0, APPROVED_CAMPERS).map((r) => ({ id: r.id, qrToken: r.qrToken, registrationNumber: r.registrationNumber })),
  };
  fs.writeFileSync(path.join(__dirname, "..", ".camp-simulation.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ campers: CAMPERS, approvedCampers: APPROVED_CAMPERS, teachers: TEACHERS, approvedTeachers: APPROVED_TEACHERS, tribes: TRIBES, rooms: rooms.length, beds: rooms.length * 6 }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
