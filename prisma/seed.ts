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

// ─── Production data — campuses, tribes, departments ──────────────────────────

const CAMPUSES = [
  { name: "Iganmu Campus", campusCode: "IGM", displayOrder: 1, address: "The Covenant Place, Right Beside National Theatre", city: "Iganmu", state: "Lagos", country: "Nigeria" },
  { name: "Yaba Campus", campusCode: "YAB", displayOrder: 2, address: "400 Herbert Macaulay Road", city: "Yaba", state: "Lagos", zipCode: "100001", country: "Nigeria" },
  { name: "Lekki Campus", campusCode: "LKK", displayOrder: 3, address: "The Covenant Temple, Chisco Bus Stop, Behind Enyo Fuel Station", city: "Lekki", state: "Lagos", country: "Nigeria" },
  { name: "Ikeja Campus", campusCode: "IKJ", displayOrder: 4, address: "Lagos Marriott Hotel, GRA", city: "Ikeja", state: "Lagos", country: "Nigeria" },
  { name: "Maryland Campus", campusCode: "MYD", displayOrder: 5, address: "Genesis Cinema, Maryland Mall", city: "Maryland", state: "Lagos", country: "Nigeria" },
  { name: "Victoria Island Campus", campusCode: "VIC", displayOrder: 6, address: "Lagoon Restaurant, Ozumba Mbadiwe", city: "Victoria Island", state: "Lagos", country: "Nigeria" },
  { name: "Ajah Campus", campusCode: "AJH", displayOrder: 7, address: "Filmhouse Cinemas, Ikota Blackbell Mall", city: "Ajah", state: "Lagos", country: "Nigeria" },
  { name: "Sangotedo Campus", campusCode: "SGT", displayOrder: 8, address: "Genesis Cinema, Novare Mall", city: "Sangotedo", state: "Lagos", country: "Nigeria" },
  { name: "Ketu Ikosi Campus", campusCode: "KET", displayOrder: 9, address: "Centre for Management Development (CMD), Management Village, CMD Avenue, Shangisha", city: "Ketu", state: "Lagos", country: "Nigeria" },
  { name: "Anthony Campus", campusCode: "ANT", displayOrder: 10, address: "The Podium Event Centre, 10 Kudeti Avenue, Onigbongbo", city: "Anthony", state: "Lagos", country: "Nigeria" },
  { name: "Isolo Campus", campusCode: "ISL", displayOrder: 11, address: "23 Adebisi Omotola Street, By Asuani Police Station, Off Victoria Street", city: "Isolo", state: "Lagos", country: "Nigeria" },
  { name: "Festac Campus", campusCode: "FST", displayOrder: 12, address: "1st Avenue, Beside i-Fitness Gym", city: "Festac Town", state: "Lagos", country: "Nigeria" },
  { name: "Igando Campus", campusCode: "IGD", displayOrder: 13, address: "Lagos Theatre, 88 College Street, NYSC Bus Stop, LASU/Isheri Road", city: "Igando", state: "Lagos", country: "Nigeria" },
  { name: "Egbeda Campus", campusCode: "EGB", displayOrder: 14, address: "Grand Ovation Centre, Moshalashi Bus Stop, Beside Mobil Filling Station, Idimu Road", city: "Egbeda", state: "Lagos", country: "Nigeria" },
  { name: "Abule Egba Campus", campusCode: "AEG", displayOrder: 15, address: "3L Events Place, Chijioke House, Opposite Northwest Filling Station, General Bus Stop, Lagos-Abeokuta Expressway", city: "Abule Egba", state: "Lagos", country: "Nigeria" },
  { name: "Ikorodu Campus", campusCode: "IKD", displayOrder: 16, address: "Dream Parks and Gardens, Off Radio Road, Hilltop Estate, Obafemi Awolowo Road", city: "Ikorodu", state: "Lagos", country: "Nigeria" },
  { name: "Badagry Campus", campusCode: "BDG", displayOrder: 17, address: "Sycomore Hotels Event Hall, No. 1 Seje Road, Ajara-Topa", city: "Badagry", state: "Lagos", country: "Nigeria" },
];

const TRIBES = [
  { name: "AGAPE", code: "AGP", color: "#E53935", displayOrder: 1, meaning: "Unconditional Love", motto: "Love Never Fails", scripture: "John 13:34", description: "Agape is the highest form of love — selfless, unconditional, and sacrificial." },
  { name: "BERACAH", code: "BER", color: "#1E88E5", displayOrder: 2, meaning: "Blessing", motto: "Blessed to be a Blessing", scripture: "2 Chronicles 20:26", description: "Beracah — the Valley of Blessing. Where battles are won through worship." },
  { name: "CHARIS", code: "CHA", color: "#43A047", displayOrder: 3, meaning: "Grace", motto: "By Grace We Stand", scripture: "Ephesians 2:8", description: "Charis — the Greek word for grace. Unmerited favour from God." },
  { name: "KABOD", code: "KAB", color: "#FB8C00", displayOrder: 4, meaning: "Glory", motto: "His Glory Alone", scripture: "Isaiah 6:3", description: "Kabod — the weighty, manifest glory of God that fills the earth." },
  { name: "KADOSH", code: "KDS", color: "#8E24AA", displayOrder: 5, meaning: "Holy", motto: "Set Apart for Greatness", scripture: "1 Peter 1:16", description: "Kadosh — holy, consecrated, set apart. Called to a higher standard." },
  { name: "PETRA", code: "PET", color: "#6D4C41", displayOrder: 6, meaning: "Rock", motto: "Built on the Rock", scripture: "Matthew 7:24-25", description: "Petra — the solid rock on which we stand, unmoved by any storm." },
  { name: "RHEMA", code: "RHM", color: "#00897B", displayOrder: 7, meaning: "Living Word", motto: "Your Word is Truth", scripture: "John 17:17", description: "Rhema — the spoken, living word of God that brings life and transformation." },
  { name: "SOPHIA", code: "SOP", color: "#3949AB", displayOrder: 8, meaning: "Wisdom", motto: "Wisdom is Supreme", scripture: "Proverbs 4:7", description: "Sophia — divine wisdom that surpasses human understanding." },
  { name: "TEHILAH", code: "TEH", color: "#C0A000", displayOrder: 9, meaning: "Praise", motto: "A Garment of Praise", scripture: "Isaiah 61:3", description: "Tehilah — spontaneous, inspired praise that emerges from a heart overwhelmed by God." },
  { name: "PISTIS", code: "PIS", color: "#00ACC1", displayOrder: 10, meaning: "Faith", motto: "Faith Moves Mountains", scripture: "Hebrews 11:1", description: "Pistis — the Greek word for faith. Conviction of things unseen, foundation of hope." },
  { name: "TODAH", code: "TOD", color: "#5E35B1", displayOrder: 11, meaning: "Thanksgiving", motto: "Enter with Thanksgiving", scripture: "Psalm 100:4", description: "Todah — sacrificial thanksgiving offered before the victory is seen." },
  { name: "ZOE", code: "ZOE", color: "#D81B60", displayOrder: 12, meaning: "Life", motto: "Life More Abundantly", scripture: "John 10:10", description: "Zoe — the God-kind of life. Eternal, abundant, overflowing life in Christ." },
];

const DEPARTMENTS = [
  "SOCIAL MEDIA", "PROTOCOL/USHERS", "FOOD", "REGISTRATION", "HOSTEL COORDINATORS",
  "PRAYER", "GAMES", "MEDICAL", "FACILITY", "VMD", "MEDIA", "SECURITY",
  "TRANSPORTATION", "DRINKING WATER", "COUNSELLING",
];

// ─── Seed helpers ──────────────────────────────────────────────────────────────

async function seedCampuses(organizationId: string) {
  console.log(`\nSeeding ${CAMPUSES.length} campuses...\n`);
  let created = 0, updated = 0;
  for (const campus of CAMPUSES) {
    const slug = slugify(campus.name);
    const existing = await prisma.campus.findFirst({
      where: { organizationId, name: campus.name, deletedAt: null },
    });
    if (existing) {
      await prisma.campus.update({
        where: { id: existing.id },
        data: { slug, address: campus.address, city: campus.city, state: campus.state, zipCode: (campus as any).zipCode || null, country: campus.country, campusCode: campus.campusCode, displayOrder: campus.displayOrder, active: true, signupOpen: true },
      });
      updated++;
    } else {
      await prisma.campus.create({
        data: { name: campus.name, slug, address: campus.address, city: campus.city, state: campus.state, zipCode: (campus as any).zipCode || null, country: campus.country, campusCode: campus.campusCode, displayOrder: campus.displayOrder, organizationId, active: true, signupOpen: true },
      });
      created++;
    }
  }
  console.log(`\nCampuses: ${created} created, ${updated} updated\n`);
}

async function seedTribes(campId: string) {
  console.log(`\nSeeding ${TRIBES.length} tribes...\n`);
  let created = 0, updated = 0;
  for (const tribe of TRIBES) {
    const existing = await prisma.tribe.findFirst({
      where: { campId, name: tribe.name, deletedAt: null },
    });
    if (existing) {
      await prisma.tribe.update({
        where: { id: existing.id },
        data: { code: tribe.code, color: tribe.color, displayOrder: tribe.displayOrder, meaning: tribe.meaning, motto: tribe.motto, scripture: tribe.scripture, description: tribe.description, gender: "MIXED", ageRange: "All Ages", allocationStrategy: "MANUAL", status: "ACTIVE" },
      });
      updated++;
    } else {
      await prisma.tribe.create({
        data: { campId, name: tribe.name, code: tribe.code, color: tribe.color, displayOrder: tribe.displayOrder, meaning: tribe.meaning, motto: tribe.motto, scripture: tribe.scripture, description: tribe.description, gender: "MIXED", ageRange: "All Ages", allocationStrategy: "MANUAL", status: "ACTIVE", points: 0 },
      });
      created++;
    }
  }
  console.log(`\nTribes: ${created} created, ${updated} updated\n`);
}

async function seedDepartments(organizationId: string, campId: string) {
  console.log(`\nSeeding ${DEPARTMENTS.length} departments...\n`);
  let created = 0, updated = 0;
  for (const name of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({
      where: { organizationId, campId, name, deletedAt: null },
    });
    if (existing) {
      await prisma.department.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
      updated++;
    } else {
      await prisma.department.create({ data: { organizationId, campId, name, responsibilities: [], status: "ACTIVE" } });
      created++;
    }
  }
  console.log(`\nDepartments: ${created} created, ${updated} updated\n`);
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

  // Organization.name is unique — find-or-create so re-running the seed
  // against a DB that already has "Demo Organization" doesn't fork a second
  // org (previously always ran organization.create unconditionally).
  const organization = await prisma.organization.upsert({
    where: { name: "Demo Organization" },
    update: {},
    create: { name: "Demo Organization" },
  });

  // Create a default camp for the organization
  const currentYear = new Date().getFullYear();

  let camp = await prisma.camp.findFirst({
    where: { organizationId: organization.id, year: currentYear },
  });
  if (!camp) {
    camp = await prisma.camp.create({
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
  }

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

  let campus = await prisma.campus.findFirst({
    where: { organizationId: organization.id, name: "Demo Campus" },
  });
  if (!campus) {
    campus = await prisma.campus.create({
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
  }

  // Create a venue (physical camp site for this camp)
  let venue = await prisma.venue.findFirst({ where: { campId: camp.id, name: "Demo Venue" } });
  if (!venue) {
    venue = await prisma.venue.create({
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
  }

  const campusRep = await prisma.user.upsert({
    where: { email: campusRepEmail },
    update: {},
    create: {
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
  let camper = await prisma.camper.findFirst({ where: { userId: campusRep.id, name: "Demo Camper" } });
  if (!camper) {
    camper = await prisma.camper.create({
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
  }

  // Create a sample registration
  const existingRegistration = await prisma.registration.findFirst({ where: { camperId: camper.id, campId: camp.id } });
  if (!existingRegistration) {
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
  }

  // Approved teacher (for testing teacher dashboard/attendance)
  const teacherEmail = "teacher@camply.com";
  const teacherPassword = await bcrypt.hash("password123", 10);
  const teacherUser = await prisma.user.upsert({
    where: { email: teacherEmail },
    update: {},
    create: {
      email: teacherEmail,
      password: teacherPassword,
      role: "TEACHER",
      firstName: "Demo",
      lastName: "Teacher",
      active: true,
      organizationId: organization.id,
    },
  });
  const existingTeacherProfile = await prisma.staffProfile.findFirst({ where: { userId: teacherUser.id, campId: camp.id } });
  if (!existingTeacherProfile) {
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
  }

  // Approved volunteer, Medical department (for testing volunteer dashboard)
  const volunteerEmail = "volunteer@camply.com";
  const volunteerPassword = await bcrypt.hash("password123", 10);
  const volunteerUser = await prisma.user.upsert({
    where: { email: volunteerEmail },
    update: {},
    create: {
      email: volunteerEmail,
      password: volunteerPassword,
      role: "VOLUNTEER",
      firstName: "Demo",
      lastName: "Volunteer",
      active: true,
      organizationId: organization.id,
    },
  });
  const existingVolunteerProfile = await prisma.staffProfile.findFirst({ where: { userId: volunteerUser.id, campId: camp.id } });
  if (!existingVolunteerProfile) {
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
  }

  // Seed production data (campuses, tribes, departments)
  await seedCampuses(organization.id);
  await seedTribes(camp.id);
  await seedDepartments(organization.id, camp.id);

  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
