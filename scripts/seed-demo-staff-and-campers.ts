import { PrismaClient, UserRole, StaffType, StaffStatus, RegistrationStatus } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

const FIRST_NAMES_MALE = [
  "Alexander", "Benjamin", "Caleb", "Daniel", "Ethan", "Gabriel", "Henry", "Isaac",
  "Jacob", "Lucas", "Matthew", "Nathan", "Oliver", "Samuel", "Thomas", "William",
  "David", "Joshua", "Elijah", "Noah", "James", "Logan", "Mason", "Jack",
  "Michael", "Carter", "Wyatt", "Jayden", "Dylan", "Luke", "Sebastian"
];

const FIRST_NAMES_FEMALE = [
  "Abigail", "Amelia", "Charlotte", "Daisy", "Emma", "Fiona", "Grace", "Hannah",
  "Isabella", "Julia", "Kate", "Lily", "Mia", "Nora", "Olivia", "Penelope",
  "Sophia", "Victoria", "Zoe", "Chloe", "Ella", "Ava", "Harper", "Evelyn",
  "Emily", "Elizabeth", "Sofia", "Avery", "Ella", "Scarlett", "Grace"
];

const LAST_NAMES = [
  "Adeboye", "Okonkwo", "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia",
  "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson",
  "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez",
  "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"
];

const SCHOOLS = [
  "St. Andrews Academy", "Greenwood High School", "International School Lagos",
  "Corona Secondary School", "Atlantic Hall", "Chrisland High", "Grange School",
  "Whiteplains Academy", "Loyola Jesuit College", "Meadow Hall School"
];

const CHURCHES = [
  "Grace Community Church", "Redeemed Christian Church", "Daystar Christian Centre",
  "Fountain of Life", "Elevation Church", "House on the Rock", "Covenant Christian Centre",
  "Believers LoveWorld", "Kingsway International", "Victory Worship Centre"
];

async function helperUpsertStaffProfile(
  userId: string,
  campId: string,
  orgId: string,
  type: StaffType,
  fn: string,
  ln: string,
  email: string,
  phone: string
) {
  const existing = await prisma.staffProfile.findFirst({
    where: { userId, campId, deletedAt: null },
  });

  if (existing) {
    await prisma.staffProfile.update({
      where: { id: existing.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
  } else {
    await prisma.staffProfile.create({
      data: {
        userId,
        campId,
        organizationId: orgId,
        type,
        status: "APPROVED",
        firstName: fn,
        lastName: ln,
        email,
        phone,
        approvedAt: new Date(),
      },
    });
  }
}

async function seedDemoData() {
  console.log("🚀 Starting Demo Staff & Camper Seeding...");

  // 1. Fetch Owner and Organization
  const owner = await prisma.user.findFirst({
    where: { email: "owner@camply.com" },
    include: {
      organization: {
        include: {
          camps: { where: { active: true } },
          campuses: true,
        },
      },
    },
  });

  if (!owner || !owner.organization) {
    throw new Error("Owner user (owner@camply.com) or Demo Organization not found.");
  }

  const orgId = owner.organization.id;
  const activeCamp = owner.organization.camps[0];
  const campuses = owner.organization.campuses;

  if (!activeCamp) {
    throw new Error("No active camp found under Demo Organization.");
  }

  const tribes = await prisma.tribe.findMany({
    where: { campId: activeCamp.id, deletedAt: null },
  });

  console.log(`📌 Org: ${owner.organization.name} (${orgId})`);
  console.log(`📌 Camp: ${activeCamp.name} (${activeCamp.id})`);
  console.log(`📌 Campuses: ${campuses.length}, Tribes: ${tribes.length}`);

  const hashedPassword = await hashPassword("password123");

  // 2. Seed 50 Normal Teachers
  console.log("\n👨‍🏫 Seeding 50 Normal Teachers...");
  for (let i = 1; i <= 50; i++) {
    const fn = FIRST_NAMES_MALE[i % FIRST_NAMES_MALE.length];
    const ln = LAST_NAMES[i % LAST_NAMES.length];
    const email = `teacher.normal.${i}@camply.test`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { password: hashedPassword, active: true },
      create: {
        email,
        password: hashedPassword,
        role: "TEACHER",
        firstName: fn,
        lastName: ln,
        phone: `+1555100${String(i).padStart(4, "0")}`,
        active: true,
        organizationId: orgId,
        homeCampusId: campuses[i % campuses.length]?.id,
      },
    });

    await helperUpsertStaffProfile(
      user.id,
      activeCamp.id,
      orgId,
      "TEACHER",
      fn,
      ln,
      user.email,
      user.phone || "+15551000000"
    );
  }
  console.log("✅ 50 Normal Teachers seeded.");

  // 3. Seed 30 Teachers with Campus Rep Status
  console.log("\n🏫 Seeding 30 Teachers with Campus Rep Status...");
  for (let i = 1; i <= 30; i++) {
    const fn = FIRST_NAMES_FEMALE[i % FIRST_NAMES_FEMALE.length];
    const ln = LAST_NAMES[i % LAST_NAMES.length];
    const email = `teacher.rep.${i}@camply.test`;
    const targetCampus = campuses[i % campuses.length];

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        password: hashedPassword,
        active: true,
        managedCampuses: targetCampus ? { connect: [{ id: targetCampus.id }] } : undefined,
      },
      create: {
        email,
        password: hashedPassword,
        role: "TEACHER",
        firstName: fn,
        lastName: ln,
        phone: `+1555200${String(i).padStart(4, "0")}`,
        active: true,
        organizationId: orgId,
        homeCampusId: targetCampus?.id,
        managedCampuses: targetCampus ? { connect: [{ id: targetCampus.id }] } : undefined,
      },
    });

    await helperUpsertStaffProfile(
      user.id,
      activeCamp.id,
      orgId,
      "TEACHER",
      fn,
      ln,
      user.email,
      user.phone || "+15552000000"
    );
  }
  console.log("✅ 30 Teachers with Campus Rep Status seeded.");

  // 4. Seed 20 Volunteers
  console.log("\n🙋‍♂️ Seeding 20 Volunteers...");
  for (let i = 1; i <= 20; i++) {
    const fn = FIRST_NAMES_MALE[(i + 5) % FIRST_NAMES_MALE.length];
    const ln = LAST_NAMES[(i + 5) % LAST_NAMES.length];
    const email = `volunteer.${i}@camply.test`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { password: hashedPassword, active: true },
      create: {
        email,
        password: hashedPassword,
        role: "VOLUNTEER",
        firstName: fn,
        lastName: ln,
        phone: `+1555300${String(i).padStart(4, "0")}`,
        active: true,
        organizationId: orgId,
        homeCampusId: campuses[i % campuses.length]?.id,
      },
    });

    await helperUpsertStaffProfile(
      user.id,
      activeCamp.id,
      orgId,
      "VOLUNTEER",
      fn,
      ln,
      user.email,
      user.phone || "+15553000000"
    );
  }
  console.log("✅ 20 Volunteers seeded.");

  // 5. Seed Parent Users for Campers
  console.log("\n👨‍👩‍👧 Seeding 100 Parent Users...");
  const parents: any[] = [];
  for (let i = 1; i <= 100; i++) {
    const fn = FIRST_NAMES_MALE[i % FIRST_NAMES_MALE.length];
    const ln = LAST_NAMES[i % LAST_NAMES.length];
    const email = `parent.demo.${i}@camply.test`;

    const parent = await prisma.user.upsert({
      where: { email },
      update: { password: hashedPassword, active: true },
      create: {
        email,
        password: hashedPassword,
        role: "PARENT",
        firstName: fn,
        lastName: ln,
        phone: `+1555400${String(i).padStart(4, "0")}`,
        active: true,
        organizationId: orgId,
      },
    });
    parents.push(parent);
  }
  console.log(`✅ ${parents.length} Parent Users ready.`);

  // 6. Seed 600 Campers with Registrations
  console.log("\n🏕️ Seeding 600 Campers & Registrations...");

  const timestamp = Date.now();
  for (let i = 1; i <= 600; i++) {
    const isMale = i % 2 === 0;
    const fn = isMale
      ? FIRST_NAMES_MALE[i % FIRST_NAMES_MALE.length]
      : FIRST_NAMES_FEMALE[i % FIRST_NAMES_FEMALE.length];
    const ln = LAST_NAMES[i % LAST_NAMES.length];
    const fullName = `${fn} ${ln}`;
    const parent = parents[i % parents.length];
    const campus = campuses[i % campuses.length];

    // Determine status breakdown:
    // 1..350 => APPROVED (350)
    // 351..500 => PENDING (150)
    // 501..600 => CHECKED_IN (100)
    let regStatus: RegistrationStatus = "APPROVED";
    let checkedInAt: Date | undefined = undefined;
    let approvedAt: Date | undefined = new Date();

    if (i > 350 && i <= 500) {
      regStatus = "PENDING";
      approvedAt = undefined;
    } else if (i > 500) {
      regStatus = "CHECKED_IN";
      checkedInAt = new Date();
      approvedAt = new Date();
    }

    const assignedTribe = regStatus !== "PENDING" && tribes.length > 0
      ? tribes[i % tribes.length]
      : null;

    const camperCode = `CMP-${timestamp}-${String(i).padStart(4, "0")}`;

    // Create camper
    const camper = await prisma.camper.create({
      data: {
        name: fullName,
        firstName: fn,
        lastName: ln,
        gender: isMale ? "Male" : "Female",
        dateOfBirth: new Date(2010 + (i % 7), (i % 12), (i % 28) + 1),
        photoUrl: `https://images.unsplash.com/photo-${1500000000000 + (i % 50)}?w=150`,
        school: SCHOOLS[i % SCHOOLS.length],
        church: CHURCHES[i % CHURCHES.length],
        parentPhone: parent.phone || "+15550000000",
        emergencyContactName: `${parent.firstName} ${parent.lastName}`,
        emergencyContactPhone: parent.phone || "+15550000000",
        userId: parent.id,
        organizationId: orgId,
        homeCampusId: campus?.id,
        active: true,
      },
    });

    // Create Registration
    await prisma.registration.create({
      data: {
        status: regStatus,
        camperId: camper.id,
        campId: activeCamp.id,
        campusId: campus?.id || campuses[0].id,
        tribeId: assignedTribe?.id,
        registrationNumber: `REG-${timestamp.toString().slice(-6)}-${String(i).padStart(4, "0")}`,
        qrToken: `QR-${camperCode}`,
        submittedAt: new Date(Date.now() - (i * 3600000)),
        approvedAt: approvedAt,
        checkedInAt: checkedInAt,
        review: regStatus !== "PENDING" ? {
          create: {
            verificationStatus: "COMPLETED",
            adminDecision: "APPROVE",
            decidedAt: approvedAt || new Date(),
          }
        } : {
          create: {
            verificationStatus: "NOT_STARTED",
          }
        },
      },
    });

    if (i % 100 === 0) {
      console.log(`   Progress: ${i}/600 campers seeded...`);
    }
  }

  console.log("\n🎉 Seeding Completed Successfully!");
  console.log("Summary:");
  console.log(" - 50 Normal Teachers (approved)");
  console.log(" - 30 Teachers with Campus Rep Status (approved)");
  console.log(" - 20 Volunteers (approved)");
  console.log(" - 600 Campers (350 Approved, 150 Pending, 100 In Camp)");
  console.log(" - Password for all seeded users: password123");
}

seedDemoData()
  .catch((e) => {
    console.error("❌ Seeding Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
