const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MEDICAL_EDUCATION_KEYS = [
  "allergies",
  "medicalConditions",
  "medications",
  "dietaryRestrictions",
  "emergencyContactName",
  "emergencyContactPhone",
  "relationship",
  "school",
  "currentClass",
  "church",
  "pastor",
];

async function main() {
  console.log('Syncing CAMPER system field visibility defaults...');

  const result = await prisma.formField.updateMany({
    where: {
      audience: "CAMPER",
      source: "SYSTEM",
      systemKey: { in: MEDICAL_EDUCATION_KEYS },
      visible: false,
      deletedAt: null,
    },
    data: { visible: true },
  });

  console.log(`  Flipped ${result.count} CAMPER system field(s) to visible=true.`);

  const remaining = await prisma.formField.findMany({
    where: {
      audience: "CAMPER",
      source: "SYSTEM",
      systemKey: { in: MEDICAL_EDUCATION_KEYS },
      visible: false,
      deletedAt: null,
    },
    select: { label: true, systemKey: true, organizationId: true },
  });

  if (remaining.length > 0) {
    console.log(`  ${remaining.length} field(s) still hidden (may be deliberate admin choice):`);
    remaining.forEach((f) => console.log(`    - ${f.label} (${f.systemKey}) in org ${f.organizationId}`));
  }

  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
