import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Communication Dashboard", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    // Seed a campaign + recipient so dashboard has data
    const campaign = await prisma.emailCampaign.create({
      data: {
        organizationId,
        name: "E2E Test Campaign",
        subject: "Dashboard Test",
        body: { type: "doc", content: [{ type: "paragraph", content: [{ text: "Hello" }] }] },
        status: "COMPLETED",
        createdById: (await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } })).id,
        recipientCount: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await prisma.emailRecipient.create({
      data: {
        campaignId: campaign.id,
        userId: (await prisma.user.findFirstOrThrow({ where: { organizationId, role: "PARENT" } })).id,
        email: "parent@camply.test",
        recipientType: "PARENT",
        deliveryStatus: "SENT",
        deliverySource: "CAMPAIGN",
        subject: "Dashboard Test",
        sentAt: new Date(),
      },
    });
  });

  test.afterAll(async () => {
    await prisma.emailRecipient.deleteMany({ where: { campaign: { organizationId } } });
    await prisma.emailCampaign.deleteMany({ where: { organizationId } });
  });

  test("dashboard loads with stats and recent activity", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");

    // Navigate via sidebar
    await page.goto("/admin/communication/dashboard");
    await expect(page.getByRole("heading", { name: "Communication Dashboard" })).toBeVisible();

    // Stats cards should be present
    await expect(page.getByText("Sent Today")).toBeVisible();
    await expect(page.getByText("Sent This Week")).toBeVisible();
    await expect(page.getByText("Queue Size")).toBeVisible();
    await expect(page.getByText("Success Rate")).toBeVisible();

    // Recent activity section
    await expect(page.getByText("Recent Activity")).toBeVisible();
    await expect(page.getByText("E2E Test Campaign")).toBeVisible();
  });
});
