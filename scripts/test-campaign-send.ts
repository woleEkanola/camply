import { PrismaClient } from "@prisma/client";
import { appRouter } from "../src/server/api/root";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: { not: "" } } });
  if (!org) { console.log("No org"); process.exit(1); }
  console.log("Org:", org.name);

  // Enable ID card in branding
  await (prisma as any).organizationBranding.upsert({
    where: { organizationId: org.id },
    update: { idCardEnabled: true },
    create: { organizationId: org.id, idCardEnabled: true },
  });

  // Enable Camp Invitation template's includeIdCard
  const ciTemplate = await (prisma as any).emailTemplate.findFirst({
    where: { organizationId: org.id, name: "Camp Invitation" },
  });
  if (ciTemplate) {
    await (prisma as any).emailTemplate.update({
      where: { id: ciTemplate.id },
      data: { includeIdCard: true },
    });
    console.log("Camp Invitation template includeIdCard: true");
  }

  // Find approved registrations
  const regs: any[] = await (prisma as any).registration.findMany({
    where: { status: "APPROVED", deletedAt: null },
    include: { camper: { select: { name: true, user: { select: { email: true, id: true } } } }, camp: { select: { id: true, name: true } } },
    take: 3,
  });
  if (!regs.length) { console.log("No approved registrations"); process.exit(1); }

  const parentEmails = [...new Set(regs.filter((r: any) => r.camper?.user?.email).map((r: any) => r.camper.user.email))];
  const campId = regs[0].campId;
  console.log("Camp ID:", campId.substring(0,8));
  console.log("Approved:", regs.length, "| Parent emails:", parentEmails);

  const admin: any = await (prisma as any).user.findFirst({ where: { organizationId: org.id, role: "ADMIN" } });
  if (!admin) { console.log("No admin"); process.exit(1); }

  const caller = appRouter.createCaller({
    prisma,
    session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: org.id }, expires: "" },
  } as any);

  // Create campaign
  console.log("\n--- Create campaign ---");
  const campaign: any = await caller.communication.campaignCreate({
    name: "Auto-Test " + Date.now(),
    subject: "Camp Invitation Test " + Date.now(),
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello {{camper_name}}!" }] }] },
    audienceFilter: { recipientType: "PARENTS" } as any,
    personalizeEvent: "CAMP_INVITATION",
    personalizeCampId: campId,
  } as any);
  console.log("Draft:", campaign.id.substring(0,8));

  // Check recipients
  console.log("\n--- Check recipients ---");
  const check: any = await caller.communication.campaignCheckManualRecipients({
    id: campaign.id, manualEmails: parentEmails,
  });
  console.log("Matched:", check.matched, "| Unmatched:", check.unmatched);

  // Send
  console.log("\n--- Send ---");
  try {
    const result = await caller.communication.campaignSend({
      id: campaign.id, manualEmails: parentEmails,
    });
    console.log("Send result: recipientCount=", result.recipientCount);
  } catch (err: any) {
    console.log("Send error:", err.message);
  }

  // Delivery status
  const recipients = await (prisma as any).emailRecipient.findMany({
    where: { campaignId: campaign.id },
    select: { email: true, deliveryStatus: true, failedReason: true, providerMessageId: true },
  });
  console.log("\n--- Delivery ---");
  for (const r of recipients) {
    console.log("  ", r.email, "→", r.deliveryStatus,
      r.providerMessageId ? "(resend_id: " + r.providerMessageId + ")" : "",
      r.failedReason || "");
  }

  const final = await (prisma as any).emailCampaign.findUnique({
    where: { id: campaign.id },
    select: { status: true, recipientCount: true },
  });
  console.log("\nCampaign status:", final.status, "| recipients:", final.recipientCount);

  await prisma.$disconnect();
}
main();
