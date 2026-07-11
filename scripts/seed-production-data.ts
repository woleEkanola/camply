/**
 * seed-production-data.ts
 *
 * Seeds campuses, tribes, and departments into the production database
 * for the organization owned by innovativekemka@gmail.com.
 *
 * Safe to re-run — uses upsert/findFirst patterns to avoid duplicates.
 *
 * Usage:
 *   npx ts-node scripts/seed-production-data.ts
 *
 * Or with env vars:
 *   set -a && source .env && set +a && npx ts-node scripts/seed-production-data.ts
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ─── Slug helper (mirrors prisma/seed.ts) ────────────────────────────────────

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

// ─── Data ────────────────────────────────────────────────────────────────────

const TARGET_EMAIL = "innovativekemka@gmail.com";

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
  "SOCIAL MEDIA",
  "PROTOCOL/USHERS",
  "FOOD",
  "REGISTRATION",
  "HOSTEL COORDINATORS",
  "PRAYER",
  "GAMES",
  "MEDICAL",
  "FACILITY",
  "VMD",
  "MEDIA",
  "SECURITY",
  "TRANSPORTATION",
  "DRINKING WATER",
  "COUNSELLING",
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function seedCampuses(organizationId: string) {
  console.log(`\n🏫 Seeding ${CAMPUSES.length} campuses...\n`);

  let created = 0;
  let updated = 0;

  for (const campus of CAMPUSES) {
    const slug = slugify(campus.name);
    const existing = await prisma.campus.findFirst({
      where: { organizationId, name: campus.name, deletedAt: null },
    });

    if (existing) {
      await prisma.campus.update({
        where: { id: existing.id },
        data: {
          slug,
          address: campus.address,
          city: campus.city,
          state: campus.state,
          zipCode: (campus as any).zipCode || null,
          country: campus.country,
          campusCode: campus.campusCode,
          displayOrder: campus.displayOrder,
          active: true,
          signupOpen: true,
        },
      });
      console.log(`  ♻️  Updated: ${campus.name} (${campus.campusCode})`);
      updated++;
    } else {
      await prisma.campus.create({
        data: {
          name: campus.name,
          slug,
          address: campus.address,
          city: campus.city,
          state: campus.state,
          zipCode: (campus as any).zipCode || null,
          country: campus.country,
          campusCode: campus.campusCode,
          displayOrder: campus.displayOrder,
          organizationId,
          active: true,
          signupOpen: true,
        },
      });
      console.log(`  ✨ Created: ${campus.name} (${campus.campusCode})`);
      created++;
    }
  }

  console.log(`\n✅ Campuses: ${created} created, ${updated} updated\n`);
}

async function seedTribes(campId: string) {
  console.log(`\n🌿 Seeding ${TRIBES.length} tribes...\n`);

  let created = 0;
  let updated = 0;

  for (const tribe of TRIBES) {
    const existing = await prisma.tribe.findFirst({
      where: { campId, name: tribe.name, deletedAt: null },
    });

    if (existing) {
      await prisma.tribe.update({
        where: { id: existing.id },
        data: {
          code: tribe.code,
          color: tribe.color,
          displayOrder: tribe.displayOrder,
          meaning: tribe.meaning,
          motto: tribe.motto,
          scripture: tribe.scripture,
          description: tribe.description,
          gender: "MIXED",
          ageRange: "All Ages",
          allocationStrategy: "MANUAL",
          status: "ACTIVE",
        },
      });
      console.log(`  ♻️  Updated: ${tribe.name} (${tribe.code}) ${tribe.color}`);
      updated++;
    } else {
      await prisma.tribe.create({
        data: {
          campId,
          name: tribe.name,
          code: tribe.code,
          color: tribe.color,
          displayOrder: tribe.displayOrder,
          meaning: tribe.meaning,
          motto: tribe.motto,
          scripture: tribe.scripture,
          description: tribe.description,
          gender: "MIXED",
          ageRange: "All Ages",
          allocationStrategy: "MANUAL",
          status: "ACTIVE",
          points: 0,
        },
      });
      console.log(`  ✨ Created: ${tribe.name} (${tribe.code}) ${tribe.color}`);
      created++;
    }
  }

  console.log(`\n✅ Tribes: ${created} created, ${updated} updated\n`);
}

async function seedDepartments(organizationId: string, campId: string | null) {
  console.log(`\n🏗️  Seeding ${DEPARTMENTS.length} departments...\n`);

  let created = 0;
  let updated = 0;

  for (const name of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({
      where: { organizationId, campId, name, deletedAt: null },
    });

    if (existing) {
      await prisma.department.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
        },
      });
      console.log(`  ♻️  Updated: ${name}`);
      updated++;
    } else {
      await prisma.department.create({
        data: {
          organizationId,
          campId,
          name,
          responsibilities: [],
          status: "ACTIVE",
        },
      });
      console.log(`  ✨ Created: ${name}`);
      created++;
    }
  }

  console.log(`\n✅ Departments: ${created} created, ${updated} updated\n`);
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Camply — Production Data Seed");
  console.log(`  Target account: ${TARGET_EMAIL}`);
  console.log("═══════════════════════════════════════════════\n");

  // Resolve the target organization
  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
  });

  if (!user || !user.organizationId) {
    console.error(`❌ User ${TARGET_EMAIL} with an organization not found.`);
    process.exit(1);
  }

  const organizationId = user.organizationId;
  console.log(`✅ Found organization: ${organizationId}`);

  // Resolve the active camp
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { activeCampId: true, activeCamp: { select: { name: true } } },
  });

  const campId = org?.activeCampId ?? null;

  if (campId) {
    console.log(`✅ Active camp: "${org?.activeCamp?.name}" (${campId})`);
  } else {
    console.log("⚠️  No active camp set — tribes and departments will be created as org-wide templates (campId: null).");
  }

  // Seed in order
  await seedCampuses(organizationId);
  await seedTribes(campId!);
  await seedDepartments(organizationId, campId);

  console.log("═══════════════════════════════════════════════");
  console.log("  All production data seeded successfully!");
  console.log("═══════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
