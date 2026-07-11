const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Syncing existing churchDepartment and preferredCampusId types in FormField table...');
  const res1 = await prisma.formField.updateMany({
    where: { systemKey: 'churchDepartment', type: 'TEXT' },
    data: { type: 'SELECT' },
  });
  console.log(`  Updated ${res1.count} churchDepartment fields to SELECT.`);

  const res2 = await prisma.formField.updateMany({
    where: { systemKey: 'preferredCampusId', type: 'TEXT' },
    data: { type: 'SELECT' },
  });
  console.log(`  Updated ${res2.count} preferredCampusId fields to SELECT.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
