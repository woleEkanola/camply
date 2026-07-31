import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  // Update existing PENDING reg to APPROVED
  const pending = await (p as any).registration.findFirst({ where: { status: "PENDING", deletedAt: null },
    include: { camper: { select: { name: true, user: { select: { email: true } } } } }
  });
  if (pending) {
    const qrToken = "qr-" + Math.random().toString(36).slice(2, 16);
    const updated = await (p as any).registration.update({
      where: { id: pending.id },
      data: { status: "APPROVED", registrationNumber: "TEST-" + Date.now(), qrToken }
    });
    process.stdout.write("Updated PENDING -> APPROVED\n");
    process.stdout.write("Camper: " + pending.camper.name + "\n");
    process.stdout.write("Parent email: " + pending.camper.user?.email + "\n");
    process.stdout.write("QR token: " + updated.qrToken + "\n");
  }
  await p.$disconnect();
}
main();
