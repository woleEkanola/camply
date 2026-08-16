import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, switchRegistrationsToListView } from "./helpers";
import { appRouter } from "../src/server/api/root";

/**
 * The two non-composer places a targeted invitation resend can be triggered
 * from: the registrations page bulk action bar (fastest path for the
 * reported "resend to one parent" use case), and the campaign detail page's
 * "Resend to specific parents" dialog (reuses the exact subject/body/
 * attachments of a completed campaign via sourceCampaignId).
 */
test.describe("Invitation resend: registrations bulk action + campaign detail dialog", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `e2e-entry-${Date.now()}`;
  let orgId: string;
  let campId: string;
  let campusId: string;
  let tribeId: string;
  let adminId: string;
  let regId: string;
  const emails: string[] = [];
  const cleanupCampaignIds = new Set<string>();

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const tribe = await prisma.tribe.findFirst({ where: { campId } });
    if (!tribe) throw new Error("No tribe in fixture camp");
    tribeId = tribe.id;

    const admin = await prisma.user.findFirstOrThrow({ where: { organizationId: orgId, role: "ADMIN" } });
    adminId = admin.id;

    await prisma.organizationBranding.upsert({
      where: { organizationId: orgId },
      update: { idCardEnabled: true },
      create: { organizationId: orgId, idCardEnabled: true },
    });

    const email = `${stamp}-parent@camply.test`;
    emails.push(email);
    const parent = await prisma.user.create({
      data: { email, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId },
    });
    const camper = await prisma.camper.create({
      data: { name: `${stamp} Camper`, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Male" },
    });
    const reg = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, tribeId, status: "APPROVED", registrationNumber: `${stamp}-REG`, qrToken: `${stamp}-qr` },
    });
    regId = reg.id;
  });

  test.afterAll(async () => {
    const ids = [...cleanupCampaignIds];
    if (ids.length > 0) {
      await prisma.emailRecipient.deleteMany({ where: { campaignId: { in: ids } } });
      await prisma.sideEffect.deleteMany({ where: { campaignId: { in: ids } } });
      await prisma.emailCampaign.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.registration.deleteMany({ where: { id: regId } });
    await prisma.camper.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  test("registrations page bulk action resends to the selected registration", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    const row = page.locator("tr", { hasText: `${stamp} Camper` }).first();
    await row.waitFor({ state: "visible", timeout: 15000 });
    await row.getByRole("checkbox", { name: "Select row" }).check();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Resend Camp Invitation" }).click();

    await expect
      .poll(
        async () => {
          const campaigns = await prisma.emailCampaign.findMany({
            where: { organizationId: orgId, personalizeCampId: campId, recipients: { some: { registrationId: regId } } },
            orderBy: { createdAt: "desc" },
          });
          return campaigns.length;
        },
        { timeout: 20000 }
      )
      .toBeGreaterThan(0);

    const campaign = await prisma.emailCampaign.findFirstOrThrow({
      where: { organizationId: orgId, personalizeCampId: campId, recipients: { some: { registrationId: regId } } },
      orderBy: { createdAt: "desc" },
    });
    cleanupCampaignIds.add(campaign.id);
    const recipients = await prisma.emailRecipient.findMany({ where: { campaignId: campaign.id } });
    expect(recipients).toHaveLength(1);
    expect(recipients[0].registrationId).toBe(regId);
  });

  test("campaign detail 'Resend to specific parents' clones the source campaign into a new one scoped to the picked registration", async ({ page }) => {
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: adminId, email: "admin@camply.com", role: "ADMIN", organizationId: orgId }, expires: "" },
    } as any);

    const source: any = await caller.communication.campaignCreate({
      name: `${stamp} Source Campaign`,
      subject: `${stamp} Source Subject {{camper_name}}`,
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello {{camper_name}}!" }] }] },
      audienceFilter: { recipientType: "PARENTS" } as any,
      personalizeEvent: "CAMP_INVITATION",
      personalizeCampId: campId,
    } as any);
    cleanupCampaignIds.add(source.id);
    await caller.communication.campaignSend({ id: source.id, registrationIds: [regId] } as any);

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto(`/admin/communication/campaigns/${source.id}`);

    await page.getByRole("button", { name: "Resend to specific parents" }).click();
    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();

    const searchInput = dialog.getByPlaceholder("Search by camper name, parent email, or registration number…");
    await searchInput.fill(`${stamp} Camper`);
    const results = page.getByTestId("invitation-recipient-search-results");
    await expect(results).toContainText(`${stamp} Camper`);
    await results.getByText(`${stamp} Camper`, { exact: false }).first().click();

    const beforeUrl = page.url();
    await dialog.getByRole("button", { name: /^Resend to 1$/ }).click();
    // `waitForURL` with a regex trivially "passes" if the current URL
    // already matches (both `/campaigns/new` and `/campaigns/<source.id>`
    // satisfy `[a-z0-9]+$`) — wait for an actual change instead.
    await page.waitForURL((url) => url.toString() !== beforeUrl && /\/admin\/communication\/campaigns\/[a-z0-9]+$/.test(url.pathname), { timeout: 20000 });

    const newCampaignId = page.url().split("/").pop()!;
    expect(newCampaignId).not.toBe(source.id);
    cleanupCampaignIds.add(newCampaignId);

    const newCampaign = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: newCampaignId } });
    expect(newCampaign.subject).toBe(source.subject);

    const newRecipients = await prisma.emailRecipient.findMany({ where: { campaignId: newCampaignId } });
    expect(newRecipients).toHaveLength(1);
    expect(newRecipients[0].registrationId).toBe(regId);
  });
});
