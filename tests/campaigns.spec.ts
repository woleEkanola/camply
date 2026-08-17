import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Campaigns", () => {
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
  });

  test.afterAll(async () => {
    await prisma.emailRecipient.deleteMany({ where: { campaign: { organizationId } } });
    await prisma.emailCampaign.deleteMany({ where: { organizationId } });
  });

  test("creates a draft campaign and shows it in the list", async ({ page }) => {
    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");

    // Navigate to campaign composer
    await page.goto("/admin/communication/campaigns/new");
    await expect(page.getByRole("heading", { name: "New Campaign" })).toBeVisible({ timeout: 15000 });

    // Fill in form
    await page.locator("input").first().fill("E2E Draft Campaign");
    await page.locator("input").nth(1).fill("E2E Test Subject");

    // Save draft
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 15000 });

    // Verify in DB
    const campaign = await prisma.emailCampaign.findFirst({
      where: { organizationId, name: "E2E Draft Campaign" },
    });
    expect(campaign).toBeTruthy();
    expect(campaign!.status).toBe("DRAFT");
  });

  test("campaign detail reports accurate counts and rates", async ({ page }) => {
    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const campaign = await prisma.emailCampaign.create({
      data: {
        organizationId,
        name: "E2E Stats Campaign",
        subject: "Stats Test",
        body: { type: "doc", content: [{ type: "paragraph", content: [{ text: "Stats" }] }] },
        status: "COMPLETED",
        createdById: admin.id,
        recipientCount: 8,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const parent = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "PARENT" } });
    const base = {
      campaignId: campaign.id,
      organizationId,
      userId: parent.id,
      recipientType: "PARENT",
      deliverySource: "CAMPAIGN",
      subject: "Stats Test",
    };
    const now = new Date();

    // 8 recipients covering every case the counters have to get right:
    //   accepted-by-provider (sent) = 5   delivered = 3   opened = 2   clicked = 1
    //   never attempted (queued + held) = 2, which must NOT drag Success Rate down
    await prisma.emailRecipient.createMany({
      data: [
        { ...base, email: "delivered@test.com", deliveryStatus: "DELIVERED", sentAt: now, deliveredAt: now },
        // Opened via the pixel before any delivered event landed — still counts as delivered.
        { ...base, email: "opened@test.com", deliveryStatus: "OPENED", sentAt: now, openedAt: now },
        // Clicked with the pixel blocked: openedAt is backfilled, status never says OPENED.
        // A status-based open count would miss this one.
        { ...base, email: "clicked@test.com", deliveryStatus: "CLICKED", sentAt: now, openedAt: now, clickedAt: now },
        { ...base, email: "sent@test.com", deliveryStatus: "SENT", sentAt: now },
        { ...base, email: "delayed@test.com", deliveryStatus: "DELAYED", sentAt: now },
        { ...base, email: "failed@test.com", deliveryStatus: "FAILED", failedReason: "Rejected" },
        { ...base, email: "queued@test.com", deliveryStatus: "QUEUED" },
        { ...base, email: "held@test.com", deliveryStatus: "HELD", failedReason: "Missing email" },
      ],
    });

    await page.goto(`/admin/communication/campaigns/${campaign.id}`);
    await expect(page.getByText("E2E Stats Campaign")).toBeVisible({ timeout: 15000 });

    const tile = (id: string) => page.getByTestId(`stat-${id}-value`);

    await expect(tile("total")).toHaveText("8");
    await expect(tile("queued")).toHaveText("1");
    await expect(tile("held")).toHaveText("1");
    // SENT + DELAYED + DELIVERED + OPENED + CLICKED — the bucket must not shrink
    // as recipients engage with the mail.
    await expect(tile("sent")).toHaveText("5");
    await expect(tile("delivered")).toHaveText("3");
    await expect(tile("opened")).toHaveText("2");
    await expect(tile("clicked")).toHaveText("1");
    await expect(tile("failed")).toHaveText("1");

    // 3 delivered / 5 accepted. Against `total` this would read 38% and make a
    // perfectly healthy campaign look broken because two rows were never sent.
    await expect(tile("success-rate")).toHaveText("60%");
    // 2 opened / 3 delivered
    await expect(tile("open-rate")).toHaveText("67%");

    await expect(page.getByText("Stats Test")).toBeVisible();
  });

  test("a campaign with nothing sent yet shows no rate, not 0%", async ({ page }) => {
    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const campaign = await prisma.emailCampaign.create({
      data: {
        organizationId,
        name: "E2E Unsent Campaign",
        subject: "Not sent yet",
        body: { type: "doc", content: [{ type: "paragraph", content: [{ text: "Queued" }] }] },
        status: "SENDING",
        createdById: admin.id,
        recipientCount: 2,
        startedAt: new Date(),
      },
    });

    const parent = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "PARENT" } });
    await prisma.emailRecipient.createMany({
      data: [
        { campaignId: campaign.id, organizationId, userId: parent.id, email: "q1@test.com", recipientType: "PARENT", deliverySource: "CAMPAIGN", deliveryStatus: "QUEUED" },
        { campaignId: campaign.id, organizationId, userId: parent.id, email: "q2@test.com", recipientType: "PARENT", deliverySource: "CAMPAIGN", deliveryStatus: "QUEUED" },
      ],
    });

    await page.goto(`/admin/communication/campaigns/${campaign.id}`);
    await expect(page.getByText("E2E Unsent Campaign")).toBeVisible({ timeout: 15000 });

    // "0%" would read as "every message failed" — which is exactly how a campaign
    // looked while the webhook secret was unconfigured. No denominator, no rate.
    await expect(page.getByTestId("stat-success-rate-value")).toHaveText("—");
    await expect(page.getByTestId("stat-open-rate-value")).toHaveText("—");
  });
});
