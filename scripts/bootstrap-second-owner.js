/** One-time local-dev bootstrap: a fresh second OWNER account + empty Organization + active Camp, to verify the Import/Export round-trip locally. */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

(async () => {
  const email = "owner2-import-demo@camply.test";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Second owner account already exists:", existing.id);
    await prisma.$disconnect();
    return;
  }

  const org = await prisma.organization.create({ data: { name: "Import Demo Org (Local)" } });

  const camp = await prisma.camp.create({
    data: {
      name: "Import Demo Camp 2026",
      slug: `import-demo-camp-2026-${Date.now()}`,
      year: 2026,
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 10),
      organizationId: org.id,
      status: "OPEN",
      approvalMode: "MANUAL",
      orgCode: "IDC",
    },
  });

  await prisma.organization.update({ where: { id: org.id }, data: { activeCampId: camp.id } });

  const hashedPassword = await bcrypt.hash("password123", 10);
  const owner = await prisma.user.create({
    data: { email, password: hashedPassword, role: "OWNER", organizationId: org.id, passwordSet: true },
  });

  console.log("Created organization:", org.id, org.name);
  console.log("Created active camp:", camp.id, camp.name);
  console.log("Created owner user:", owner.id, owner.email, "(password: password123)");
  await prisma.$disconnect();
})();
