import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Communication campaign summary", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    // Ensure admin@camply.com is attached to fixture organization
    await prisma.user.update({
      where: { email: "admin@camply.com" },
      data: { organizationId },
    }).catch(() => {});

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    // Seed a campaign so the consolidated campaign workspace has list data.
    await prisma.emailCampaign.create({
      data: {
        organizationId,
        name: "E2E Test Campaign",
        subject: "Dashboard Test",
        body: { type: "doc", content: [{ type: "paragraph", content: [{ text: "Hello" }] }] },
        status: "COMPLETED",
        createdById: admin.id,
        recipientCount: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

  });

  test.afterAll(async () => {
    await prisma.emailRecipient.deleteMany({ where: { campaign: { organizationId } } });
    await prisma.emailCampaign.deleteMany({ where: { organizationId } });
  });

  test("legacy dashboard redirects to campaign summary", async ({ page }) => {
    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");

    // Old bookmarks remain valid and land on the consolidated workspace.
    await page.goto("/admin/communication/dashboard");
    await expect(page).toHaveURL(/\/admin\/communication\/campaigns/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Email Campaigns" })).toBeVisible();

    // Useful operational metrics now sit above the campaigns list.
    await expect(page.getByText("Sent Today")).toBeVisible();
    await expect(page.getByText("Queue Size")).toBeVisible();
    await expect(page.getByText("Running", { exact: true })).toBeVisible();
    await expect(page.getByText("E2E Test Campaign")).toBeVisible();
  });
});
