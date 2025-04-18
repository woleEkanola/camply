const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'superadmin@camply.com';
  const password = 'supersecure'; // Change this as needed
  const hashed = await bcrypt.hash(password, 10);

  // Upsert super admin
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: hashed,
      role: 'SUPER_ADMIN',
    },
  });

  console.log('Super admin seeded:', email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
