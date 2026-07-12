/**
 * One-time local-dev bootstrap: creates the innovativekemka@gmail.com OWNER
 * account + an Organization + active Camp locally, so scripts/seed-production-data.ts
 * (which expects that user to already exist) has something to attach campuses/
 * tribes/departments to. Local dev DB only — never run against production.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

(async () => {
  const email = "innovativekemka@gmail.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Owner account already exists:", existing.id);
    await prisma.$disconnect();
    return;
  }

  const org = await prisma.organization.create({ data: { name: "The Covenant Place (Local)" } });

  const camp = await prisma.camp.create({
    data: {
      name: "Camply Camp 2026",
      slug: `camply-camp-2026-${Date.now()}`,
      year: 2026,
      startDate: new Date(2026, 6, 1),
      endDate: new Date(2026, 6, 10),
      organizationId: org.id,
      status: "OPEN",
      approvalMode: "MANUAL",
      minAge: 6,
      maxAge: 17,
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "CCP",
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
