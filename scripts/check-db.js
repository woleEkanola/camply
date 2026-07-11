const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    take: 10,
    select: { id: true, email: true, role: true, organizationId: true }
  });
  console.log('USERS:', JSON.stringify(users, null, 2));

  const orgs = await prisma.organization.findMany({ take: 5 });
  console.log('ORGS:', JSON.stringify(orgs, null, 2));

  const camps = await prisma.camp.findMany({ where: { deletedAt: null }, take: 5, select: { id: true, name: true, active: true, organizationId: true } });
  console.log('CAMPS:', JSON.stringify(camps, null, 2));

  const campuses = await prisma.campus.findMany({ where: { deletedAt: null }, take: 10, select: { id: true, name: true, organizationId: true } });
  console.log('CAMPUSES:', JSON.stringify(campuses, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
