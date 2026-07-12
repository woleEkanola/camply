export {}; // Force module scope so this file's top-level declarations (PrismaClient, prisma, slugify, ...) don't collide with other standalone scripts like scripts/seed-production-data.ts under TypeScript's global-script type-checking.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Helper function to create URL-friendly slugs
function slugify(text: string) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

async function main() {
  // Create a Super Admin user if it doesn't exist
  const superAdminEmail = "superadmin@camply.com";
  const hashedPassword = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {}, // No updates if exists
    create: {
      email: superAdminEmail,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      firstName: "Super",
      lastName: "Admin",
      active: true,
    },
  });

  // Create an Owner user for testing
  const ownerEmail = "owner@camply.com";
  const ownerPassword = await bcrypt.hash("password123", 10);

  // Create organization without activeCampId
  const organization = await prisma.organization.create({
    data: {
      name: "Demo Organization",
    },
  });

  // Create a default camp for the organization
  const currentYear = new Date().getFullYear();

  const camp = await prisma.camp.create({
    data: {
      name: `${currentYear}`,
      slug: slugify(`${currentYear}`),
      year: currentYear,
      startDate: new Date(currentYear, 0, 1), // January 1st of current year
      endDate: new Date(currentYear, 11, 31), // December 31st of current year
      active: true,
      organizationId: organization.id,
      theme: "Demo Camp Theme",
      description: "A demo camp used for local development and seed data.",
      registrationOpensAt: new Date(currentYear, 0, 1),
      registrationClosesAt: new Date(currentYear, 11, 1),
      arrivalDate: new Date(currentYear, 11, 15),
      departureDate: new Date(currentYear, 11, 20),
      minAge: 6,
      maxAge: 17,
      ageCutoffDate: new Date(currentYear, 11, 1),
      maxRegistrations: 500,
      capacityBehavior: "WAITLIST",
      approvalMode: "MANUAL",
      allowResubmission: true,
      status: "OPEN",
      orgCode: "DEMO",
    },
  });

  // Update organization with the active camp
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      activeCampId: camp.id,
    },
  });

  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {}, // No updates if exists
    create: {
      email: ownerEmail,
      password: ownerPassword,
      role: "OWNER",
      firstName: "Demo",
      lastName: "Owner",
      active: true,
      organizationId: organization.id,
    },
  });

  // Create an Admin user for testing
  const adminEmail = "admin@camply.com";
  const adminPassword = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {}, // No updates if exists
    create: {
      email: adminEmail,
      password: adminPassword,
      role: "ADMIN",
      firstName: "Demo",
      lastName: "Admin",
      active: true,
      organizationId: organization.id,
    },
  });

  // Create a Campus Representative user for testing
  const campusRepEmail = "campusrep@camply.com";
  const campusRepPassword = await bcrypt.hash("password123", 10);

  // Create a campus (permanent church branch)

  const campus = await prisma.campus.create({
    data: {
      name: "Demo Campus",
      slug: slugify("Demo Campus"),
      address: "123 Main St",
      city: "Demo City",
      state: "DS",
      zipCode: "12345",
      country: "Demo Country",
      organizationId: organization.id,
      campusCode: "DEM",
      email: "campus@camply.com",
      phone: "+1-555-0100",
      active: true,
    },
  });

  // Create a venue (physical camp site for this camp)
  const venue = await prisma.venue.create({
    data: {
      name: "Demo Venue",
      address: "123 Main St",
      campId: camp.id,
      code: "DEM",
      contactEmail: "venue@camply.com",
      contactPhone: "+1-555-0100",
      quota: 250,
      visible: true,
    },
  });

  // Document requirements for the demo camp
  await prisma.documentRequirement.createMany({
    data: [
      {
        campId: camp.id,
        name: "Birth Certificate",
        description: "A clear photo or scan of the camper's birth certificate.",
        required: true,
        scope: "CAMPER",
        sortOrder: 0,
      },
      {
        campId: camp.id,
        name: "Parent Consent Form",
        description: "Signed consent form for this camp.",
        required: true,
        scope: "REGISTRATION",
        sortOrder: 1,
      },
    ],
  });

  const campusRep = await prisma.user.create({
    data: {
      email: campusRepEmail,
      password: campusRepPassword,
      role: "CAMPUS_REPRESENTATIVE",
      firstName: "Campus",
      lastName: "Representative",
      active: true,
      organizationId: organization.id,
    },
  });

  // Connect the campus representative to the campus
  await prisma.campus.update({
    where: { id: campus.id },
    data: {
      reps: {
        connect: { id: campusRep.id }
      }
    }
  });

  // Create a sample camper
  const camper = await prisma.camper.create({
    data: {
      name: "Demo Camper",
      firstName: "Demo",
      lastName: "Camper",
      dateOfBirth: new Date(currentYear - 12, 5, 1),
      gender: "MALE",
      userId: campusRep.id, // Assign to campus rep for testing
      organizationId: organization.id,
      homeCampusId: campus.id,
      active: true,
    },
  });

  // Create a sample registration
  await prisma.registration.create({
    data: {
      camperId: camper.id,
      campId: camp.id,
      campusId: campus.id,
      venueId: venue.id,
      status: "PENDING",
      notes: "Sample registration for testing",
    },
  });

  // Approved teacher (for testing teacher dashboard/attendance)
  const teacherEmail = "teacher@camply.com";
  const teacherPassword = await bcrypt.hash("password123", 10);
  const teacherUser = await prisma.user.create({
    data: {
      email: teacherEmail,
      password: teacherPassword,
      role: "TEACHER",
      firstName: "Demo",
      lastName: "Teacher",
      active: true,
      organizationId: organization.id,
    },
  });
  await prisma.staffProfile.create({
    data: {
      userId: teacherUser.id,
      organizationId: organization.id,
      campId: camp.id,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "Demo",
      lastName: "Teacher",
      phone: "+1-555-0200",
      email: teacherEmail,
      skills: ["Teaching", "Counseling"],
      assignedVenueId: venue.id,
      approvedAt: new Date(),
    },
  });

  // Approved volunteer, Medical department (for testing volunteer dashboard)
  const volunteerEmail = "volunteer@camply.com";
  const volunteerPassword = await bcrypt.hash("password123", 10);
  const volunteerUser = await prisma.user.create({
    data: {
      email: volunteerEmail,
      password: volunteerPassword,
      role: "VOLUNTEER",
      firstName: "Demo",
      lastName: "Volunteer",
      active: true,
      organizationId: organization.id,
    },
  });
  await prisma.staffProfile.create({
    data: {
      userId: volunteerUser.id,
      organizationId: organization.id,
      campId: camp.id,
      type: "VOLUNTEER",
      status: "APPROVED",
      firstName: "Demo",
      lastName: "Volunteer",
      phone: "+1-555-0300",
      email: volunteerEmail,
      volunteerCategory: "Medical",
      skills: ["Medical"],
      assignedVenueId: venue.id,
      approvedAt: new Date(),
    },
  });

  console.log("Seed completed: Users, organization, campus, camp, venue, registration, teacher, and volunteer created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
