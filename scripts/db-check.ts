import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const regs: any[] = await (p as any).registration.findMany({ select: { status: true, id: true, camperId: true, campId: true }, take: 20 });
  process.stdout.write("Regs: " + regs.length + "\n");
  const statuses = [...new Set(regs.map((r: any) => r.status))];
  process.stdout.write("Statuses: " + JSON.stringify(statuses) + "\n");
  
  const campers: any[] = await (p as any).camper.findMany({ include: { user: { select: { email: true } } }, take: 3 });
  for (const c of campers) {
    process.stdout.write("Camper: " + c.name + " -> " + (c.user?.email || "no-user") + "\n");
  }

  const camps: any[] = await (p as any).camp.findMany({ take: 3 });
  for (const c of camps) {
    process.stdout.write("Camp: " + c.name + " (" + c.id.substring(0, 8) + ")\n");
  }
  await p.$disconnect();
}
main();
