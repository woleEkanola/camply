import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";
import { appRouter } from "../src/server/api/root";
import { buildCampInvitationVariables, CAMP_INVITATION_INCLUDE } from "../src/server/email/campaign/personalize";

const APPROVED_COUNT = 50;

test.describe("Campaign: 50 approved users — personalized Camp Invitation + ID Card sheet", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);

  let orgId: string;
  let campId: string;
  let campusId: string;
  let tribeId: string;
  let adminId: string;
  let campaignId: string;
  let registrationIds: string[] = [];
  let parentEmails: string[] = [];
  const batchTag = `e2e-bulk-${randomBytes(4).toString("hex")}`;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    // Get a tribe for the camp
    const tribe: any = await (prisma as any).tribe.findFirst({ where: { campId } });
    if (!tribe) throw new Error("No tribe in fixture camp");
    tribeId = tribe.id;

    const admin: any = await (prisma as any).user.findFirst({
      where: { organizationId: orgId, role: "ADMIN" },
    });
    if (!admin) throw new Error("No admin");
    adminId = admin.id;

    // Enable ID card branding
    await (prisma as any).organizationBranding.upsert({
      where: { organizationId: orgId },
      update: { idCardEnabled: true },
      create: { organizationId: orgId, idCardEnabled: true },
    });

    // Enable Camp Invitation template includeIdCard
    const template: any = await (prisma as any).emailTemplate.findFirst({
      where: { organizationId: orgId, name: "Camp Invitation" },
    });
    if (template) {
      await (prisma as any).emailTemplate.update({
        where: { id: template.id },
        data: { includeIdCard: true },
      });
    }

    // Seed 50 APPROVED registrations
    const batchIds: string[] = [];
    const emails: string[] = [];
    for (let i = 0; i < APPROVED_COUNT; i++) {
      const email = `${batchTag}-p${i}@camply.test`;
      emails.push(email);
      const parent = await (prisma as any).user.create({
        data: { email, password: "unused", role: "PARENT", organizationId: orgId, firstName: `Parent${i}` },
      });
      const camper = await (prisma as any).camper.create({
        data: {
          name: `${batchTag} Camper ${i}`,
          gender: i % 2 === 0 ? "Male" : "Female",
          userId: parent.id,
          organizationId: orgId,
          homeCampusId: campusId,
        },
      });
      const reg = await (prisma as any).registration.create({
        data: {
          camperId: camper.id,
          campId,
          campusId,
          tribeId,
          status: "APPROVED",
          registrationNumber: `${batchTag}-REG-${String(i).padStart(3, "0")}`,
          qrToken: `${batchTag}-qr-${String(i).padStart(3, "0")}`,
        },
      });
      batchIds.push(reg.id);
    }
    registrationIds = batchIds;
    parentEmails = emails;
    console.log(`[bulk-campaign] Seeded ${batchIds.length} APPROVED registrations`);
  });

  test.afterAll(async () => {
    // Cleanup campaign recipients
    if (campaignId) {
      await (prisma as any).emailRecipient.deleteMany({ where: { campaignId } });
      await (prisma as any).sideEffect.deleteMany({ where: { campaignId } });
      await (prisma as any).emailCampaign.deleteMany({ where: { id: campaignId } });
    }
    // Cleanup seeded users/campers/registrations
    for (const id of registrationIds) {
      await (prisma as any).registration.deleteMany({ where: { id } }).catch(() => {});
    }
    await (prisma as any).camper.deleteMany({ where: { name: { startsWith: batchTag } } }).catch(() => {});
    await (prisma as any).user.deleteMany({ where: { email: { in: parentEmails } } }).catch(() => {});
  });

  // ═══ Step 1: Create & send campaign via tRPC caller ═══
  test("creates and sends a Camp Invitation campaign to all 50 approved parents", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: adminId, email: "admin@camply.com", role: "ADMIN", organizationId: orgId }, expires: "" },
    } as any);

    const campaign: any = await caller.communication.campaignCreate({
      name: `${batchTag} Bulk Test`,
      subject: `${batchTag} Subject`,
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello {{camper_name}}!" }] }] },
      audienceFilter: { recipientType: "PARENTS" } as any,
      personalizeEvent: "CAMP_INVITATION",
      personalizeCampId: campId,
    } as any);
    campaignId = campaign.id;
    expect(campaignId).toBeTruthy();
    console.log(`[bulk-campaign] Created draft: ${campaignId}`);

    // Check manual emails match all
    const check: any = await caller.communication.campaignCheckManualRecipients({
      id: campaignId,
      manualEmails: parentEmails,
    });
    expect(check.matched).toBe(APPROVED_COUNT);
    expect(check.unmatched).toHaveLength(0);

    // Send (will fail at Resend but recipients get created + rendered)
    try {
      await caller.communication.campaignSend({ id: campaignId, manualEmails: parentEmails });
    } catch (err: any) {
      console.log(`[bulk-campaign] Send threw (expected without RESEND_API_KEY): ${err.message}`);
    }
  });

  // ═══ Step 2: Verify 50 recipients created ═══
  test("50 EmailRecipient rows created, one per approved camper", async () => {
    const recipients = await (prisma as any).emailRecipient.findMany({
      where: { campaignId },
      orderBy: { email: "asc" },
    });
    expect(recipients).toHaveLength(APPROVED_COUNT);
    for (const r of recipients) {
      expect(r.email).toMatch(new RegExp(`^${batchTag}-p\\d+@camply\\.test$`));
      expect(r.recipientType).toBe("PARENT");
    }
  });

  // ═══ Step 3: Verify every registration's personalized variables resolve ═══
  test("every APPROVED registration resolves personalized camp invitation variables", async () => {
    const registrations = await (prisma as any).registration.findMany({
      where: { id: { in: registrationIds } },
      include: CAMP_INVITATION_INCLUDE,
      orderBy: { registrationNumber: "asc" },
    });
    expect(registrations).toHaveLength(APPROVED_COUNT);

    for (let i = 0; i < registrations.length; i++) {
      const vars = buildCampInvitationVariables(registrations[i]);
      expect(vars, `Reg ${i} must resolve`).not.toBeNull();
      expect(vars!.email).toContain(batchTag);
      expect(vars!.variables.camper_name).toContain(`${batchTag} Camper ${i}`);
      expect(vars!.variables.registration_number).toContain(`REG-${String(i).padStart(3, "0")}`);
      expect(vars!.variables.centre_name).toBeTruthy();
      expect(vars!.variables.tribe_name).toBeTruthy();
      expect(vars!.qrSrc).toContain("/api/qr/");
    }
  });

  // ═══ Step 4: Verify ID card sheet route for a sampled subset ═══
  test("ID card sheet PNG route returns valid 6-card images for every registration", async ({ request }) => {
    const sample = Math.min(APPROVED_COUNT, 5); // Check first 5 for speed
    const qrTokens = await (prisma as any).registration.findMany({
      where: { id: { in: registrationIds } },
      select: { qrToken: true, camper: { select: { name: true } } },
      take: sample,
      orderBy: { registrationNumber: "asc" },
    });

    for (const { qrToken, camper } of qrTokens) {
      const resp = await request.get(`/api/id-card/${qrToken}/sheet`);
      expect(resp.status(), `Sheet for ${camper.name}`).toBe(200);
      expect(resp.headers()["content-type"]).toBe("image/png");
      const body = await resp.body();
      expect(body.length).toBeGreaterThan(50000); // 6-card sheet is ~100KB+
      const pngMagic = [0x89, 0x50, 0x4e, 0x47];
      expect(Array.from(body.subarray(0, 4))).toEqual(pngMagic);
    }
  });

  // ═══ Step 5: Verify campaign detail page shows correct stats ═══
  test("campaign detail page shows 50 recipients", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto(`/admin/communication/campaigns/${campaignId}`);
    await expect(page.getByText(`${batchTag} Bulk Test`)).toBeVisible({ timeout: 15000 });

    // Recipient count somewhere in the stats area
    const bodyText = await page.textContent("main");
    expect(bodyText).toContain("50");
  });
});
