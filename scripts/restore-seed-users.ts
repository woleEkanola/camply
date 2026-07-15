export {}; // Force module scope, matching prisma/seed.ts's convention.

// One-off recovery script: the local dev DB's seeded users (owner/admin/
// superadmin/campusrep/teacher/volunteer @camply.com) were deleted at some
// point during a prior debugging session, while the org/campuses/camps/
// campers/registrations they were attached to survived. Re-running
// `npm run seed` would create a SECOND "Demo Organization" (prisma/seed.ts
// isn't idempotent on the org/camp), so this script upserts the missing
// users directly onto the EXISTING org instead.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirstOrThrow();
  if (!org.activeCampId) throw new Error("Existing org has no activeCampId — check DB state.");
  const camp = await prisma.camp.findUniqueOrThrow({ where: { id: org.activeCampId } });
  const campus = await prisma.campus.findFirstOrThrow({ where: { organizationId: org.id } });
  const venue = await prisma.venue.findFirst({ where: { campId: camp.id } });

  const password = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: "superadmin@camply.com" },
    update: {},
    create: {
      email: "superadmin@camply.com",
      password,
      role: "SUPER_ADMIN",
      firstName: "Super",
      lastName: "Admin",
      active: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "owner@camply.com" },
    update: {},
    create: {
      email: "owner@camply.com",
      password,
      role: "OWNER",
      firstName: "Demo",
      lastName: "Owner",
      active: true,
      organizationId: org.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@camply.com" },
    update: {},
    create: {
      email: "admin@camply.com",
      password,
      role: "ADMIN",
      firstName: "Demo",
      lastName: "Admin",
      active: true,
      organizationId: org.id,
    },
  });

  const campusRep = await prisma.user.upsert({
    where: { email: "campusrep@camply.com" },
    update: {},
    create: {
      email: "campusrep@camply.com",
      password,
      role: "CAMPUS_REPRESENTATIVE",
      firstName: "Campus",
      lastName: "Representative",
      active: true,
      organizationId: org.id,
    },
  });
  await prisma.campus.update({
    where: { id: campus.id },
    data: { reps: { connect: { id: campusRep.id } } },
  });

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@camply.com" },
    update: {},
    create: {
      email: "teacher@camply.com",
      password,
      role: "TEACHER",
      firstName: "Demo",
      lastName: "Teacher",
      active: true,
      organizationId: org.id,
    },
  });
  const existingTeacherProfile = await prisma.staffProfile.findFirst({
    where: { userId: teacher.id, campId: camp.id },
  });
  if (!existingTeacherProfile) {
    await prisma.staffProfile.create({
      data: {
        userId: teacher.id,
        organizationId: org.id,
        campId: camp.id,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "Demo",
        lastName: "Teacher",
        phone: "+1-555-0200",
        email: "teacher@camply.com",
        skills: ["Teaching", "Counseling"],
        assignedVenueId: venue?.id,
        approvedAt: new Date(),
      },
    });
  }

  const volunteer = await prisma.user.upsert({
    where: { email: "volunteer@camply.com" },
    update: {},
    create: {
      email: "volunteer@camply.com",
      password,
      role: "VOLUNTEER",
      firstName: "Demo",
      lastName: "Volunteer",
      active: true,
      organizationId: org.id,
    },
  });
  const existingVolunteerProfile = await prisma.staffProfile.findFirst({
    where: { userId: volunteer.id, campId: camp.id },
  });
  if (!existingVolunteerProfile) {
    await prisma.staffProfile.create({
      data: {
        userId: volunteer.id,
        organizationId: org.id,
        campId: camp.id,
        type: "VOLUNTEER",
        status: "APPROVED",
        firstName: "Demo",
        lastName: "Volunteer",
        phone: "+1-555-0300",
        email: "volunteer@camply.com",
        volunteerCategory: "Medical",
        skills: ["Medical"],
        assignedVenueId: venue?.id,
        approvedAt: new Date(),
      },
    });
  }

  console.log("Restored seed users onto org:", org.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
