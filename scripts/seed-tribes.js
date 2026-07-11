/**
 * seed-tribes.js
 * Seeds the 12 canonical tribes into the active camp.
 * Safe to re-run (upsert on campId + name).
 *
 * Usage: node scripts/seed-tribes.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CAMP_ID = 'cmrfhjb2q0003k5ecmrkcz3r8';

const TRIBES = [
  {
    name: 'AGAPE',
    code: 'AGP',
    color: '#E53935',
    displayOrder: 1,
    meaning: 'Unconditional Love',
    motto: 'Love Never Fails',
    scripture: 'John 13:34',
    description: 'Agape is the highest form of love — selfless, unconditional, and sacrificial.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'BERACAH',
    code: 'BER',
    color: '#1E88E5',
    displayOrder: 2,
    meaning: 'Blessing',
    motto: 'Blessed to be a Blessing',
    scripture: '2 Chronicles 20:26',
    description: 'Beracah — the Valley of Blessing. Where battles are won through worship.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'CHARIS',
    code: 'CHA',
    color: '#43A047',
    displayOrder: 3,
    meaning: 'Grace',
    motto: 'By Grace We Stand',
    scripture: 'Ephesians 2:8',
    description: 'Charis — the Greek word for grace. Unmerited favour from God.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'KABOD',
    code: 'KAB',
    color: '#FB8C00',
    displayOrder: 4,
    meaning: 'Glory',
    motto: 'His Glory Alone',
    scripture: 'Isaiah 6:3',
    description: 'Kabod — the weighty, manifest glory of God that fills the earth.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'KADOSH',
    code: 'KDS',
    color: '#8E24AA',
    displayOrder: 5,
    meaning: 'Holy',
    motto: 'Set Apart for Greatness',
    scripture: '1 Peter 1:16',
    description: 'Kadosh — holy, consecrated, set apart. Called to a higher standard.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'PETRA',
    code: 'PET',
    color: '#6D4C41',
    displayOrder: 6,
    meaning: 'Rock',
    motto: 'Built on the Rock',
    scripture: 'Matthew 7:24-25',
    description: 'Petra — the solid rock on which we stand, unmoved by any storm.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'RHEMA',
    code: 'RHM',
    color: '#00897B',
    displayOrder: 7,
    meaning: 'Living Word',
    motto: 'Your Word is Truth',
    scripture: 'John 17:17',
    description: 'Rhema — the spoken, living word of God that brings life and transformation.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'SOPHIA',
    code: 'SOP',
    color: '#3949AB',
    displayOrder: 8,
    meaning: 'Wisdom',
    motto: 'Wisdom is Supreme',
    scripture: 'Proverbs 4:7',
    description: 'Sophia — divine wisdom that surpasses human understanding.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'TEHILAH',
    code: 'TEH',
    color: '#C0A000',
    displayOrder: 9,
    meaning: 'Praise',
    motto: 'A Garment of Praise',
    scripture: 'Isaiah 61:3',
    description: 'Tehilah — spontaneous, inspired praise that emerges from a heart overwhelmed by God.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'PISTIS',
    code: 'PIS',
    color: '#00ACC1',
    displayOrder: 10,
    meaning: 'Faith',
    motto: 'Faith Moves Mountains',
    scripture: 'Hebrews 11:1',
    description: 'Pistis — the Greek word for faith. Conviction of things unseen, foundation of hope.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'TODAH',
    code: 'TOD',
    color: '#5E35B1',
    displayOrder: 11,
    meaning: 'Thanksgiving',
    motto: 'Enter with Thanksgiving',
    scripture: 'Psalm 100:4',
    description: 'Todah — sacrificial thanksgiving offered before the victory is seen.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
  {
    name: 'ZOE',
    code: 'ZOE',
    color: '#D81B60',
    displayOrder: 12,
    meaning: 'Life',
    motto: 'Life More Abundantly',
    scripture: 'John 10:10',
    description: 'Zoe — the God-kind of life. Eternal, abundant, overflowing life in Christ.',
    gender: 'MIXED',
    ageRange: 'All Ages',
    allocationStrategy: 'MANUAL',
    status: 'ACTIVE',
  },
];

async function main() {
  console.log(`\n🌿 Seeding ${TRIBES.length} tribes into camp ${CAMP_ID}...\n`);

  // Verify camp exists
  const camp = await prisma.camp.findUnique({ where: { id: CAMP_ID } });
  if (!camp) {
    console.error(`❌ Camp ${CAMP_ID} not found. Update CAMP_ID in this script.`);
    process.exit(1);
  }
  console.log(`✅ Camp found: ${camp.name}`);

  let created = 0;
  let updated = 0;

  for (const tribe of TRIBES) {
    // Check if tribe exists by campId + name
    const existing = await prisma.tribe.findFirst({
      where: { campId: CAMP_ID, name: tribe.name, deletedAt: null },
    });

    if (existing) {
      await prisma.tribe.update({
        where: { id: existing.id },
        data: tribe,
      });
      console.log(`  ♻️  Updated: ${tribe.name} (${tribe.code}) ${tribe.color}`);
      updated++;
    } else {
      await prisma.tribe.create({
        data: { campId: CAMP_ID, ...tribe },
      });
      console.log(`  ✨ Created: ${tribe.name} (${tribe.code}) ${tribe.color}`);
      created++;
    }
  }

  console.log(`\n✅ Done! Created ${created}, updated ${updated} tribes.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
