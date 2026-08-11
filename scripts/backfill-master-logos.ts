import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting backfill for masterLogoUrl on OrganizationBranding...");

  const brandings = await prisma.organizationBranding.findMany({
    where: {
      masterLogoUrl: null,
      logoUrl: { not: null },
    },
  });

  console.log(`Found ${brandings.length} organization branding records to backfill.`);

  let updatedCount = 0;
  for (const b of brandings) {
    if (b.logoUrl) {
      await prisma.organizationBranding.update({
        where: { id: b.id },
        data: { masterLogoUrl: b.logoUrl },
      });
      updatedCount++;
    }
  }

  console.log(`Successfully backfilled masterLogoUrl for ${updatedCount} organizations.`);
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
