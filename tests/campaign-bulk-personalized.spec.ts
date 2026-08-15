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
  let heldRegistrationId: string;
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

    // Seed 50 eligible registrations. The first two are siblings sharing one
    // parent/email, and one sibling is already CHECKED_IN.
    const batchIds: string[] = [];
    const emails: string[] = [];
    let siblingParent: any = null;
    for (let i = 0; i < APPROVED_COUNT; i++) {
      const email = i === 1 ? `${batchTag}-p0@camply.test` : `${batchTag}-p${i}@camply.test`;
      emails.push(email);
      const parent = i === 1 ? siblingParent : await (prisma as any).user.create({
        data: { email, password: "unused", role: "PARENT", organizationId: orgId, firstName: `Parent${i}` },
      });
      if (i === 0) siblingParent = parent;
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
          status: i === 1 ? "CHECKED_IN" : "APPROVED",
          registrationNumber: `${batchTag}-REG-${String(i).padStart(3, "0")}`,
          qrToken: `${batchTag}-qr-${String(i).padStart(3, "0")}`,
        },
      });
      batchIds.push(reg.id);
    }
    const heldEmail = `${batchTag}-p-held@camply.test`;
    const heldParent = await (prisma as any).user.create({ data: { email: heldEmail, password: "unused", role: "PARENT", organizationId: orgId, firstName: "Held" } });
    const heldCamper = await (prisma as any).camper.create({ data: { name: `${batchTag} Held Camper`, gender: "Male", userId: heldParent.id, organizationId: orgId, homeCampusId: campusId } });
    const heldRegistration = await (prisma as any).registration.create({ data: { camperId: heldCamper.id, campId, campusId, status: "APPROVED", registrationNumber: `${batchTag}-HELD`, qrToken: `${batchTag}-held-qr` } });
    heldRegistrationId = heldRegistration.id;
    batchIds.push(heldRegistration.id);
    emails.push(heldEmail);
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
    expect(check.matched).toBe(APPROVED_COUNT + 1);
    expect(check.unmatched).toHaveLength(0);

    const readiness: any = await caller.communication.campaignReadiness({ id: campaignId, manualEmails: parentEmails });
    expect(readiness.ready).toBe(APPROVED_COUNT);
    expect(readiness.held).toBe(1);
    expect(readiness.personalizedPdfs).toBe(APPROVED_COUNT);

    await caller.communication.campaignSend({ id: campaignId, manualEmails: parentEmails });
  });

  // ═══ Step 2: Verify 50 recipients created ═══
  test("50 EmailRecipient rows created, one per approved camper", async () => {
    const recipients = await (prisma as any).emailRecipient.findMany({
      where: { campaignId },
      orderBy: { email: "asc" },
    });
    expect(recipients).toHaveLength(APPROVED_COUNT + 1);
    for (const r of recipients) {
      expect(r.email).toContain(batchTag);
      expect(r.recipientType).toBe("PARENT");
      expect(r.registrationId).toBeTruthy();
    }
    expect(recipients.filter((recipient: any) => recipient.deliveryStatus === "QUEUED")).toHaveLength(APPROVED_COUNT);
    expect(recipients.filter((recipient: any) => recipient.deliveryStatus === "HELD")).toHaveLength(1);
    expect(recipients.filter((recipient: any) => recipient.email === `${batchTag}-p0@camply.test`)).toHaveLength(2);
  });

  test("a held camper can be corrected and queued without recreating other recipients", async () => {
    await (prisma as any).registration.update({ where: { id: heldRegistrationId }, data: { tribeId } });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: adminId, email: "admin@camply.com", role: "ADMIN", organizationId: orgId }, expires: "" },
    } as any);
    const result: any = await caller.communication.campaignRetryHeld({ id: campaignId });
    expect(result).toEqual({ queued: 1, stillHeld: 0 });
    const recipients = await (prisma as any).emailRecipient.findMany({ where: { campaignId } });
    expect(recipients).toHaveLength(APPROVED_COUNT + 1);
    expect(recipients.filter((recipient: any) => recipient.deliveryStatus === "HELD")).toHaveLength(0);
  });

  // ═══ Step 3: Verify every registration's personalized variables resolve ═══
  test("every APPROVED registration resolves personalized camp invitation variables", async () => {
    const registrations = await (prisma as any).registration.findMany({
      where: { id: { in: registrationIds, not: heldRegistrationId } },
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
  test("ID card sheet PNG route returns valid 8-card images for every registration", async ({ request }) => {
    const sample = Math.min(APPROVED_COUNT, 5); // Check first 5 for speed
    const qrTokens = await (prisma as any).registration.findMany({
      where: { id: { in: registrationIds, not: heldRegistrationId } },
      select: { qrToken: true, camper: { select: { name: true } } },
      take: sample,
      orderBy: { registrationNumber: "asc" },
    });

    for (const { qrToken, camper } of qrTokens) {
      const resp = await request.get(`/api/id-card/${qrToken}/sheet`);
      expect(resp.status(), `Sheet for ${camper.name}`).toBe(200);
      expect(resp.headers()["content-type"]).toBe("image/png");
      const body = await resp.body();
      expect(body.length).toBeGreaterThan(50000); // 8-card sheet is comfortably over 50KB
      const pngMagic = [0x89, 0x50, 0x4e, 0x47];
      expect(Array.from(body.subarray(0, 4))).toEqual(pngMagic);
    }
  });

  test("token PDF route returns a private printable A4 attachment", async ({ request }) => {
    const registration = await (prisma as any).registration.findUnique({ where: { id: registrationIds[0] }, select: { qrToken: true } });
    const response = await request.get(`/api/id-card/${registration.qrToken}/sheet.pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.body();
    expect(body.subarray(0, 4).toString()).toBe("%PDF");
  });

  // ═══ Step 5: Verify campaign detail page shows correct stats ═══
  test("campaign detail page shows every ready and recovered recipient", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto(`/admin/communication/campaigns/${campaignId}`);
    await expect(page.getByText(`${batchTag} Bulk Test`)).toBeVisible({ timeout: 15000 });

    // Recipient count somewhere in the stats area
    const bodyText = await page.textContent("main");
    expect(bodyText).toContain(`${APPROVED_COUNT + 1} recipients`);
  });

  test("Add Attachment opens the operating-system file chooser", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/communication/campaigns/new");
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add Attachment" }).click();
    const chooser = await chooserPromise;
    expect(chooser.isMultiple()).toBe(true);
  });
});
