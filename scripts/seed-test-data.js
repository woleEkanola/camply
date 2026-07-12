/**
 * seed-test-data.js
 * Seeds 100 teachers, 800 camper+parent pairs, and 50 volunteers
 * into a target organization's active camp, distributed across all of
 * that org's campuses.
 *
 * The target org/camp/campuses are resolved at runtime from an owner's
 * email (no hardcoded IDs), so it works against any local database.
 *
 * Usage:
 *   node scripts/seed-test-data.js                       # defaults to innovativekemka@gmail.com
 *   node scripts/seed-test-data.js owner@camply.com      # target a different owner
 *   SEED_TARGET_EMAIL=owner@camply.com node scripts/seed-test-data.js
 *
 * Safe to re-run — skips records whose email already exists.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ── Config (resolved dynamically in main() from the target owner's email) ──────
const TARGET_EMAIL = process.argv[2] || process.env.SEED_TARGET_EMAIL || 'innovativekemka@gmail.com';
let ORG_ID;   // resolved from the target user's organizationId
let CAMP_ID;  // resolved from the org's activeCampId
let CAMPUSES; // resolved from the org's non-deleted campuses (id + name)

// ── Name pools ────────────────────────────────────────────────────────────────
const FIRST_NAMES_M = [
  'Aaron', 'Abel', 'Abraham', 'Adebayo', 'Adedayo', 'Adeola', 'Adesuwa', 'Adewale',
  'Afolabi', 'Ahmed', 'Akin', 'Akintunde', 'Alabi', 'Amos', 'Andrew', 'Babatunde',
  'Balogun', 'Benjamin', 'Caleb', 'Chidi', 'Christian', 'Daniel', 'David', 'Dayo',
  'Ebuka', 'Elijah', 'Emmanuel', 'Emeka', 'Enoch', 'Ethan', 'Ezekiel', 'Femi',
  'Gabriel', 'Gideon', 'Henry', 'Isaac', 'Isaiah', 'Jacob', 'James', 'Jeremiah',
  'Jesse', 'Joel', 'John', 'Jonathan', 'Joseph', 'Joshua', 'Kayode', 'Kenneth',
  'Kevin', 'Kingsley', 'Kolade', 'Lanre', 'Levi', 'Lukman', 'Matthew', 'Michael',
  'Moses', 'Nathaniel', 'Nnamdi', 'Noah', 'Obinna', 'Olumide', 'Oluwaseun', 'Oluwaseyi',
  'Olusola', 'Omolade', 'Paul', 'Peter', 'Philip', 'Praise', 'Promise', 'Raphael',
  'Reuben', 'Richard', 'Samuel', 'Seun', 'Simeon', 'Solomon', 'Stephen', 'Taiwo',
  'Timilehin', 'Timothy', 'Tobi', 'Tochukwu', 'Toluwani', 'Tosin', 'Victor', 'Vincent',
  'William', 'Xavier', 'Yemi', 'Zachary', 'Zion', 'Blessing', 'Divine', 'Faith',
];

const FIRST_NAMES_F = [
  'Abigail', 'Ada', 'Adaeze', 'Adaobi', 'Adaora', 'Adeola', 'Adesola', 'Adesuwa',
  'Amaka', 'Amara', 'Amelia', 'Amirah', 'Amira', 'Angela', 'Blessing', 'Chiamaka',
  'Chidinma', 'Chisom', 'Chizaram', 'Christina', 'Deborah', 'Dorcas', 'Elizabeth',
  'Esther', 'Eva', 'Eunice', 'Faith', 'Favour', 'Florence', 'Funmi', 'Funmilayo',
  'Glory', 'Grace', 'Hannah', 'Hope', 'Ifeoma', 'Ifunanya', 'Ijeoma', 'Irene',
  'Janet', 'Jennifer', 'Jesutofunmi', 'Joan', 'Joy', 'Judith', 'Juliet', 'Kemi',
  'Lara', 'Leah', 'Linda', 'Love', 'Lydia', 'Mary', 'Mercy', 'Miriam', 'Naomi',
  'Ngozi', 'Nkechi', 'Nneka', 'Nora', 'Oluwabunmi', 'Oluwafunmilayo', 'Oluwakemi',
  'Oluwatobi', 'Oluwatosin', 'Omolara', 'Patience', 'Peace', 'Precious', 'Priscilla',
  'Rachel', 'Rebecca', 'Ruth', 'Sandra', 'Sarah', 'Sharon', 'Stella', 'Sukurat',
  'Susan', 'Temi', 'Temitope', 'Titi', 'Titilayo', 'Tobi', 'Tolani', 'Tolulope',
  'Tope', 'Tosin', 'Triumph', 'Uche', 'Victoria', 'Vivian', 'Zainab', 'Zara',
];

const LAST_NAMES = [
  'Abiodun', 'Abiola', 'Abioye', 'Adebisi', 'Adegoke', 'Adeleye', 'Adeniran', 'Adeniyi',
  'Adenuga', 'Adeogun', 'Adeola', 'Adepoju', 'Adeyemi', 'Adeyemo', 'Adeyinka', 'Agboola',
  'Aguda', 'Ajayi', 'Ajibade', 'Ajibola', 'Ajiboye', 'Akande', 'Akinlade', 'Akinola',
  'Akinpelu', 'Akinwale', 'Akinyemi', 'Akomolafe', 'Alabi', 'Alli', 'Amadi', 'Animashaun',
  'Anjorin', 'Aremu', 'Asante', 'Atanda', 'Awodele', 'Awolowo', 'Ayinde', 'Ayoola',
  'Babangida', 'Badmus', 'Bakare', 'Balogun', 'Bamgbose', 'Bankole', 'Banwo', 'Bello',
  'Chukwu', 'Coker', 'Daramola', 'David', 'Dibia', 'Dike', 'Durosinmi', 'Edun',
  'Effiong', 'Egwuatu', 'Eke', 'Ekwueme', 'Eze', 'Ezeh', 'Fashola', 'Fatunde',
  'Folorunsho', 'Gbadamosi', 'Gbenle', 'Giwa', 'Hassan', 'Idowu', 'Ifejirika', 'Igwe',
  'Ikenna', 'Ilesanmi', 'Ilo', 'Iroegbu', 'Iwu', 'Johnson', 'Kayode', 'Kehinde',
  'Kolawole', 'Komolafe', 'Lambo', 'Lawal', 'Layeni', 'Leke', 'Makinde', 'Martins',
  'Mohammed', 'Muhammed', 'Nwachukwu', 'Nweke', 'Nwosu', 'Obi', 'Obiechina', 'Obinna',
  'Odunbaku', 'Oduola', 'Ogundele', 'Ogundiran', 'Ogundipe', 'Ogunkoya', 'Oguntade',
  'Ogunwale', 'Ojomo', 'Ojo', 'Okeke', 'Okoro', 'Okonkwo', 'Okoye', 'Okpara',
  'Oladele', 'Oladipo', 'Olaiya', 'Olaleye', 'Olamide', 'Olanipekun', 'Olaniyi',
  'Olanrewaju', 'Olaoye', 'Olawale', 'Olawuyi', 'Olorunfemi', 'Oloruntobi', 'Olusegun',
  'Olutayo', 'Omoniyi', 'Onwuegbu', 'Orji', 'Oseni', 'Osewa', 'Oshodi', 'Owolabi',
  'Owoyemi', 'Oyebade', 'Oyedeji', 'Oyedele', 'Oyewole', 'Peters', 'Samuel', 'Sanni',
  'Seun', 'Shittu', 'Shokunbi', 'Soyinka', 'Taiwo', 'Thomas', 'Tijani', 'Tokunbo',
  'Umar', 'Usman', 'Wasiu', 'Williams', 'Yusuf', 'Zubair',
];

const CHURCHES = [
  'House on the Rock', 'RCCG', 'Winners Chapel', 'MFM', 'Daystar', 'City of David',
  'Fountain of Life', 'Kingdom Life', 'Christ Embassy', 'Covenant Christian Centre',
  'Elevation Church', 'Global Impact Church', 'Living Faith', 'CAC',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

let _hashedPassword = null;
async function getHashedPassword() {
  if (!_hashedPassword) _hashedPassword = await bcrypt.hash('TestCamply2026!', 10);
  return _hashedPassword;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickM() { return pick(FIRST_NAMES_M); }
function pickF() { return pick(FIRST_NAMES_F); }
function pickLast() { return pick(LAST_NAMES); }
function pickChurch() { return pick(CHURCHES); }
function pickCampus(i, total) {
  // Distribute across campuses proportionally
  const idx = Math.floor((i / total) * CAMPUSES.length);
  return CAMPUSES[Math.min(idx, CAMPUSES.length - 1)];
}

function randomGender() { return Math.random() < 0.5 ? 'MALE' : 'FEMALE'; }
function randomAge(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function dobFromAge(age) {
  const now = new Date();
  return new Date(now.getFullYear() - age, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
}

// ── Teachers ─────────────────────────────────────────────────────────────────
async function seedTeachers(passwordHash) {
  console.log('\n👨‍🏫 Seeding 100 teachers...');
  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= 100; i++) {
    const email = `teacher${String(i).padStart(3, '0')}@testcamply.com`;
    const gender = randomGender();
    const firstName = gender === 'MALE' ? pickM() : pickF();
    const lastName = pickLast();
    const campus = pickCampus(i - 1, 100);

    // Skip if already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) { skipped++; continue; }

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: 'TEACHER',
        firstName,
        lastName,
        organizationId: ORG_ID,
        homeCampusId: campus.id,
        active: true,
      },
    });

    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId: ORG_ID,
        campId: CAMP_ID,
        type: 'TEACHER',
        status: 'APPROVED',
        firstName,
        lastName,
        gender,
        dateOfBirth: dobFromAge(randomAge(22, 55)),
        phone: `+234${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        email,
        church: pickChurch(),
        yearsServing: String(Math.floor(Math.random() * 15) + 1),
        approvedAt: new Date(),
      },
    });

    created++;
    if (created % 20 === 0) process.stdout.write(`  ${created}/100 teachers...\n`);
  }
  console.log(`  ✅ Teachers: ${created} created, ${skipped} skipped (already existed)\n`);
}

// ── Volunteers ────────────────────────────────────────────────────────────────
const VOLUNTEER_CATEGORIES = [
  'Registration', 'Medical', 'Kitchen', 'Transport', 'Security',
  'Media', 'Logistics', 'Technical', 'Cleaning', 'Protocol',
];

async function seedVolunteers(passwordHash) {
  console.log('🙋 Seeding 50 volunteers...');
  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= 50; i++) {
    const email = `volunteer${String(i).padStart(2, '0')}@testcamply.com`;
    const gender = randomGender();
    const firstName = gender === 'MALE' ? pickM() : pickF();
    const lastName = pickLast();
    const campus = pickCampus(i - 1, 50);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) { skipped++; continue; }

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: 'VOLUNTEER',
        firstName,
        lastName,
        organizationId: ORG_ID,
        homeCampusId: campus.id,
        active: true,
      },
    });

    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId: ORG_ID,
        campId: CAMP_ID,
        type: 'VOLUNTEER',
        status: 'APPROVED',
        firstName,
        lastName,
        gender,
        dateOfBirth: dobFromAge(randomAge(18, 45)),
        phone: `+234${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        email,
        church: pickChurch(),
        volunteerCategory: pick(VOLUNTEER_CATEGORIES),
        approvedAt: new Date(),
      },
    });

    created++;
    if (created % 10 === 0) process.stdout.write(`  ${created}/50 volunteers...\n`);
  }
  console.log(`  ✅ Volunteers: ${created} created, ${skipped} skipped\n`);
}

// ── Campers + Parents ─────────────────────────────────────────────────────────

// Build registration number counter per campus
const counters = {};
async function loadCounters() {
  const rows = await prisma.registrationCounter.findMany({ where: { campId: CAMP_ID } });
  for (const r of rows) counters[r.campusId] = r.value;
}

async function nextRegNumber(campus, orgCode) {
  if (!counters[campus.id]) counters[campus.id] = 0;
  counters[campus.id]++;
  const n = counters[campus.id];
  // Format: ORG-CAMPUS-YYYY-NNNN  e.g. CCP-IGM-2026-0001.
  // Use the campus's unique campusCode (not a name prefix) — some campus
  // names share the same first three letters (e.g. Iganmu / Igando) and
  // would otherwise produce duplicate registration numbers.
  const campCode = (campus.campusCode || campus.name.split(' ')[0].substring(0, 3)).toUpperCase();
  const paddedN = String(n).padStart(4, '0');
  return `${orgCode ?? 'DEM'}-${campCode}-2026-${paddedN}`;
}

async function saveCounters() {
  for (const [campusId, value] of Object.entries(counters)) {
    await prisma.registrationCounter.upsert({
      where: { campId_campusId: { campId: CAMP_ID, campusId } },
      update: { value },
      create: { campId: CAMP_ID, campusId, value },
    });
  }
}

async function seedCampers(passwordHash) {
  console.log('👦 Seeding 800 campers + parents...');

  const camp = await prisma.camp.findUnique({ where: { id: CAMP_ID }, select: { orgCode: true } });
  const orgCode = camp?.orgCode ?? 'DEM';

  await loadCounters();

  let created = 0;
  let skipped = 0;

  // Batch into chunks to avoid memory issues
  const TOTAL = 800;

  for (let i = 1; i <= TOTAL; i++) {
    const parentEmail = `parent${String(i).padStart(3, '0')}@testcamply.com`;

    // Skip if parent already exists
    const existingParent = await prisma.user.findUnique({ where: { email: parentEmail } });
    if (existingParent) { skipped++; continue; }

    const camperGender = randomGender();
    const camperAge = randomAge(10, 17);
    const camperFirstName = camperGender === 'MALE' ? pickM() : pickF();
    const camperLastName = pickLast();
    const camperDob = dobFromAge(camperAge);

    const parentGender = randomGender();
    const parentFirstName = parentGender === 'MALE' ? pickM() : pickF();
    const parentLastName = camperLastName; // same family

    const campus = pickCampus(i - 1, TOTAL);

    // Create parent user
    const parent = await prisma.user.create({
      data: {
        email: parentEmail,
        password: passwordHash,
        role: 'PARENT',
        firstName: parentFirstName,
        lastName: parentLastName,
        organizationId: ORG_ID,
        homeCampusId: campus.id,
        active: true,
      },
    });

    // Create camper profile
    const camper = await prisma.camper.create({
      data: {
        name: `${camperFirstName} ${camperLastName}`,
        firstName: camperFirstName,
        lastName: camperLastName,
        gender: camperGender,
        dateOfBirth: camperDob,
        userId: parent.id,
        organizationId: ORG_ID,
        homeCampusId: campus.id,
        church: pickChurch(),
        currentClass: `Grade ${camperAge - 5}`,
        emergencyContactName: `${parentFirstName} ${parentLastName}`,
        emergencyContactPhone: `+234${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        relationship: parentGender === 'MALE' ? 'Father' : 'Mother',
        active: true,
      },
    });

    // Generate registration number
    const regNumber = await nextRegNumber(campus, orgCode);

    // Create registration
    await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId: CAMP_ID,
        campusId: campus.id,
        status: 'APPROVED',
        registrationNumber: regNumber,
        submittedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // random within last 30 days
        approvedAt: new Date(),
      },
    });

    created++;

    if (created % 100 === 0) {
      process.stdout.write(`  ${created}/${TOTAL} campers created...\n`);
    }
  }

  await saveCounters();
  console.log(`  ✅ Campers: ${created} created, ${skipped} skipped\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Camply Test Data Seeder');
  console.log(`  Target owner: ${TARGET_EMAIL}`);
  console.log('═══════════════════════════════════════════════════════');

  // Resolve org from the target owner, camp from the org's active camp,
  // and campuses from the org — no hardcoded IDs.
  const owner = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!owner || !owner.organizationId) {
    console.error(`❌ No user "${TARGET_EMAIL}" with an organization found.`);
    process.exit(1);
  }
  ORG_ID = owner.organizationId;

  const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
  if (!org) { console.error('❌ Organization not found'); process.exit(1); }
  if (!org.activeCampId) {
    console.error(`❌ Organization "${org.name}" has no active camp set. Set one before seeding.`);
    process.exit(1);
  }
  CAMP_ID = org.activeCampId;

  const camp = await prisma.camp.findUnique({ where: { id: CAMP_ID } });
  if (!camp) { console.error('❌ Active camp not found'); process.exit(1); }

  CAMPUSES = await prisma.campus.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, campusCode: true },
  });
  if (CAMPUSES.length === 0) {
    console.error(`❌ Organization "${org.name}" has no campuses to distribute people across.`);
    process.exit(1);
  }

  console.log(`\nOrg: ${org.name} | Camp: ${camp.name} | Campuses: ${CAMPUSES.length}\n`);

  const passwordHash = await getHashedPassword();
  console.log('🔑 Password hash generated (TestCamply2026!)');

  await seedTeachers(passwordHash);
  await seedVolunteers(passwordHash);
  await seedCampers(passwordHash);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  ✅ All done! Summary:');

  const teacherCount = await prisma.user.count({ where: { organizationId: ORG_ID, role: 'TEACHER' } });
  const volunteerCount = await prisma.user.count({ where: { organizationId: ORG_ID, role: 'VOLUNTEER' } });
  const parentCount = await prisma.user.count({ where: { organizationId: ORG_ID, role: 'PARENT' } });
  const camperCount = await prisma.camper.count({ where: { organizationId: ORG_ID, deletedAt: null } });
  const regCount = await prisma.registration.count({ where: { campId: CAMP_ID, deletedAt: null } });

  console.log(`  Teachers:     ${teacherCount}`);
  console.log(`  Volunteers:   ${volunteerCount}`);
  console.log(`  Parents:      ${parentCount}`);
  console.log(`  Campers:      ${camperCount}`);
  console.log(`  Registrations: ${regCount}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
