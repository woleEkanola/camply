import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * The campaign composer's InvitationRecipientPicker (src/components/communication/InvitationRecipientPicker.tsx)
 * replaces the old free-text "Override recipients" textarea in personalized
 * mode — this covers the actual reported bug: a parent needing a targeted
 * resend had no way to search for and select just their camper.
 */
test.describe("Campaign composer: invitation recipient picker", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `e2e-picker-${Date.now()}`;
  let orgId: string;
  let campId: string;
  let campusId: string;
  let tribeId: string;
  let parentId: string;
  let camperAId: string;
  let camperARegId: string;
  let camperBRegId: string;
  let noTribeRegId: string;
  const emails: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const tribe = await prisma.tribe.findFirst({ where: { campId } });
    if (!tribe) throw new Error("No tribe in fixture camp");
    tribeId = tribe.id;

    await prisma.organizationBranding.upsert({
      where: { organizationId: orgId },
      update: { idCardEnabled: true },
      create: { organizationId: orgId, idCardEnabled: true },
    });

    const parentEmail = `${stamp}-parent@camply.test`;
    emails.push(parentEmail);
    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId },
    });
    parentId = parent.id;

    const camperA = await prisma.camper.create({
      data: { name: `${stamp} CamperA`, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Male" },
    });
    camperAId = camperA.id;
    const regA = await prisma.registration.create({
      data: { camperId: camperA.id, campId, campusId, tribeId, status: "APPROVED", registrationNumber: `${stamp}-A`, qrToken: `${stamp}-qr-A` },
    });
    camperARegId = regA.id;

    const camperB = await prisma.camper.create({
      data: { name: `${stamp} CamperB`, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Female" },
    });
    const regB = await prisma.registration.create({
      data: { camperId: camperB.id, campId, campusId, tribeId, status: "APPROVED", registrationNumber: `${stamp}-B`, qrToken: `${stamp}-qr-B` },
    });
    camperBRegId = regB.id;

    // No tribe assigned — readiness must flag this and block selection.
    const noTribeEmail = `${stamp}-notribe-parent@camply.test`;
    emails.push(noTribeEmail);
    const noTribeParent = await prisma.user.create({
      data: { email: noTribeEmail, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId },
    });
    const noTribeCamper = await prisma.camper.create({
      data: { name: `${stamp} NoTribeCamper`, userId: noTribeParent.id, organizationId: orgId, homeCampusId: campusId, gender: "Male" },
    });
    const noTribeReg = await prisma.registration.create({
      data: { camperId: noTribeCamper.id, campId, campusId, status: "APPROVED", registrationNumber: `${stamp}-NT`, qrToken: `${stamp}-qr-NT` },
    });
    noTribeRegId = noTribeReg.id;
  });

  test.afterAll(async () => {
    const campaigns = await prisma.emailCampaign.findMany({ where: { organizationId: orgId, name: { contains: stamp } }, select: { id: true } });
    const campaignIds = campaigns.map((c) => c.id);
    if (campaignIds.length > 0) {
      await prisma.emailRecipient.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.sideEffect.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.emailCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    }
    await prisma.registration.deleteMany({ where: { id: { in: [camperARegId, camperBRegId, noTribeRegId] } } });
    await prisma.camper.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  test("search, select one of two siblings, skip the not-ready camper, and send only to the selected registration", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/communication/campaigns/new");

    // The composer's Input/Select components don't set id/name, so labels
    // aren't programmatically associated — this repo's existing composer
    // specs (tests/campaigns.spec.ts) use positional locators for the same
    // reason.
    await page.locator("input").first().fill(`${stamp} Resend`);
    await page.locator("input").nth(1).fill(`${stamp} Subject {{camper_name}}`);

    await page.getByText("Personalize as Camp Invitation").click();
    await page.locator("select").first().selectOption({ value: campId });

    const searchInput = page.getByPlaceholder("Search by camper name, parent email, or registration number…");
    await searchInput.fill(`${stamp} NoTribe`);
    const results = page.getByTestId("invitation-recipient-search-results");
    await expect(results).toBeVisible();
    await expect(results).toContainText("Tribe is not assigned");
    // Disabled HeadlessUI options don't fire onChange — clicking must not add a chip.
    await results.getByText(`${stamp} NoTribeCamper`).click();
    await expect(page.getByTestId("invitation-recipient-chips")).toHaveCount(0);

    await searchInput.fill(`${stamp} CamperA`);
    await expect(results).toContainText(`${stamp} CamperA`);
    await results.getByText(`${stamp} CamperA`, { exact: false }).first().click();

    const chips = page.getByTestId("invitation-recipient-chips");
    await expect(chips).toContainText(`${stamp} CamperA`);
    await expect(chips).not.toContainText(`${stamp} CamperB`);

    const beforeUrl = page.url();
    await page.getByRole("button", { name: "Send Now" }).click();
    await expect(page.getByRole("button", { name: "Confirm Send" })).toBeEnabled({ timeout: 15000 });
    await page.getByRole("button", { name: "Confirm Send" }).click();

    // `/admin/communication/campaigns/new` itself satisfies `[a-z0-9]+$`, so
    // this must wait for an actual URL change, not just a pattern match.
    await page.waitForURL((url) => url.toString() !== beforeUrl && /\/admin\/communication\/campaigns\/[a-z0-9]+$/.test(url.pathname), { timeout: 20000 });

    const campaignId = page.url().split("/").pop()!;
    const recipients = await prisma.emailRecipient.findMany({ where: { campaignId } });
    expect(recipients).toHaveLength(1);
    expect(recipients[0].registrationId).toBe(camperARegId);
  });
});
