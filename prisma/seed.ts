const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

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
  
  // Create organization without activeYearId
  const organization = await prisma.organization.create({
    data: {
      name: "Demo Organization",
    },
  });
  
  // Create a default year for the organization
  const currentYear = new Date().getFullYear();
  
  const year = await prisma.year.create({
    data: {
      name: `${currentYear}`,
      slug: slugify(`${currentYear}`),
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
  
  // Update organization with the active year
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      activeYearId: year.id,
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
  
  // Create a Location Admin user for testing
  const locationAdminEmail = "locationadmin@camply.com";
  const locationAdminPassword = await bcrypt.hash("password123", 10);
  
  // Create a location

  const location = await prisma.location.create({
    data: {
      name: "Demo Location",
      slug: slugify("Demo Location"),
      address: "123 Main St",
      city: "Demo City",
      state: "DS",
      zipCode: "12345",
      country: "Demo Country",
      organizationId: organization.id,
      code: "DEM",
      contactEmail: "location@camply.com",
      contactPhone: "+1-555-0100",
      quota: 250,
      visible: true,
    },
  });

  // Document requirements for the demo camp
  await prisma.documentRequirement.createMany({
    data: [
      {
        yearId: year.id,
        name: "Birth Certificate",
        description: "A clear photo or scan of the camper's birth certificate.",
        required: true,
        scope: "CAMPER",
        sortOrder: 0,
      },
      {
        yearId: year.id,
        name: "Parent Consent Form",
        description: "Signed consent form for this camp.",
        required: true,
        scope: "REGISTRATION",
        sortOrder: 1,
      },
    ],
  });
  
  const locationAdmin = await prisma.user.create({
    data: {
      email: locationAdminEmail,
      password: locationAdminPassword,
      role: "LOCATION_ADMIN",
      firstName: "Location",
      lastName: "Admin",
      active: true,
      organizationId: organization.id,
    },
  });
  
  // Connect the location admin to the location
  await prisma.location.update({
    where: { id: location.id },
    data: {
      admins: {
        connect: { id: locationAdmin.id }
      }
    }
  });
  
  // Create a sample camper profile
  const camperProfile = await prisma.camperProfile.create({
    data: {
      name: "Demo Camper",
      firstName: "Demo",
      lastName: "Camper",
      dateOfBirth: new Date(currentYear - 12, 5, 1),
      gender: "MALE",
      userId: locationAdmin.id, // Assign to location admin for testing
      organizationId: organization.id,
      locationId: location.id,
      active: true,
    },
  });
  
  // Create a sample registration
  await prisma.registration.create({
    data: {
      camperProfileId: camperProfile.id,
      yearId: year.id,
      locationId: location.id,
      status: "PENDING",
      notes: "Sample registration for testing",
    },
  });
  
  console.log("Seed completed: Users, organization, year, and registration created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
