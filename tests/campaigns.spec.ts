import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Campaigns", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
  });

  test.afterAll(async () => {
    await prisma.emailRecipient.deleteMany({ where: { campaign: { organizationId } } });
    await prisma.emailCampaign.deleteMany({ where: { organizationId } });
  });

  test("creates a draft campaign and shows it in the list", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");

    // Navigate to campaign composer
    await page.goto("/admin/communication/campaigns/new");
    await expect(page.getByRole("heading", { name: "New Campaign" })).toBeVisible();

    // Fill in form
    await page.locator("input").first().fill("E2E Draft Campaign");
    await page.locator("input").nth(1).fill("E2E Test Subject");

    // Save draft
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();

    // Verify in DB
    const campaign = await prisma.emailCampaign.findFirst({
      where: { organizationId, name: "E2E Draft Campaign" },
    });
    expect(campaign).toBeTruthy();
    expect(campaign!.status).toBe("DRAFT");
  });

  test("campaign detail shows stats for completed campaign", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");

    // Seed a completed campaign with recipients
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const campaign = await prisma.emailCampaign.create({
      data: {
        organizationId,
        name: "E2E Stats Campaign",
        subject: "Stats Test",
        body: { type: "doc", content: [{ type: "paragraph", content: [{ text: "Stats" }] }] },
        status: "COMPLETED",
        createdById: admin.id,
        recipientCount: 2,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const parent = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "PARENT" } });
    await prisma.emailRecipient.createMany({
      data: [
        { campaignId: campaign.id, userId: parent.id, email: "a@test.com", recipientType: "PARENT", deliveryStatus: "DELIVERED", deliverySource: "CAMPAIGN", subject: "Stats Test", sentAt: new Date(), deliveredAt: new Date() },
        { campaignId: campaign.id, userId: parent.id, email: "b@test.com", recipientType: "PARENT", deliveryStatus: "FAILED", deliverySource: "CAMPAIGN", subject: "Stats Test", failedReason: "Bounce" },
      ],
    });

    // Open detail page
    await page.goto(`/admin/communication/campaigns/${campaign.id}`);
    await expect(page.getByText("E2E Stats Campaign")).toBeVisible();

    // Stats should show
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
    await expect(page.getByText("Delivered", { exact: true })).toBeVisible();
    await expect(page.getByText("Failed/Bounced", { exact: true })).toBeVisible();
    await expect(page.getByText("Success Rate", { exact: true })).toBeVisible();

    // Subject should be visible
    await expect(page.getByText("Stats Test")).toBeVisible();
  });
});
