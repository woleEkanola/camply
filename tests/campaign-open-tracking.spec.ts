import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";
import { generateOpenToken, generateClickToken } from "../src/server/email/tracking/trackingToken";

/**
 * Covers the self-hosted half of open tracking: the 1x1 pixel and the click
 * redirect. Together with the Resend webhook (unit-tested in
 * src/app/api/webhooks/resend/__tests__/route.test.ts) these are the only two
 * ways an open ever gets recorded, and neither had end-to-end coverage.
 */
test.describe("Campaign open tracking", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campaignId: string;
  let parentId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    await prisma.user.update({
      where: { email: "admin@camply.com" },
      data: { organizationId },
    }).catch(() => {});

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const parent = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "PARENT" } });
    parentId = parent.id;

    const campaign = await prisma.emailCampaign.create({
      data: {
        organizationId,
        name: "E2E Tracking Campaign",
        subject: "Tracking Test",
        body: { type: "doc", content: [{ type: "paragraph", content: [{ text: "Track" }] }] },
        status: "COMPLETED",
        createdById: admin.id,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    campaignId = campaign.id;
  });

  test.afterAll(async () => {
    // Unconditional cleanup — runs even if an assertion above threw.
    await prisma.emailRecipient.deleteMany({ where: { campaignId } });
    await prisma.emailCampaign.deleteMany({ where: { id: campaignId } });
  });

  async function seedRecipient(email: string) {
    return prisma.emailRecipient.create({
      data: {
        campaignId,
        organizationId,
        userId: parentId,
        email,
        recipientType: "PARENT",
        deliverySource: "CAMPAIGN",
        deliveryStatus: "SENT",
        sentAt: new Date(),
      },
    });
  }

  test("fetching the tracking pixel records an open", async ({ request }) => {
    const recipient = await seedRecipient("pixel@test.com");
    const token = generateOpenToken(recipient.id, campaignId);

    const response = await request.get(`/api/track/open/${token}`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/gif");
    // Must never be cached, or a second open is invisible and — worse — proxies
    // can serve the pixel without the request ever reaching us.
    expect(response.headers()["cache-control"]).toContain("no-store");

    const row = await prisma.emailRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    expect(row.openedAt).not.toBeNull();
    expect(row.deliveryStatus).toBe("OPENED");
  });

  test("a second fetch keeps the original open timestamp", async ({ request }) => {
    const recipient = await seedRecipient("pixel-twice@test.com");
    const token = generateOpenToken(recipient.id, campaignId);

    await request.get(`/api/track/open/${token}`);
    const first = await prisma.emailRecipient.findUniqueOrThrow({ where: { id: recipient.id } });

    await request.get(`/api/track/open/${token}`);
    const second = await prisma.emailRecipient.findUniqueOrThrow({ where: { id: recipient.id } });

    // First open only — the figure is "how many people opened it", not "how many
    // times their mail client re-fetched the image".
    expect(second.openedAt?.toISOString()).toBe(first.openedAt?.toISOString());
  });

  test("a forged token records nothing but still returns a pixel", async ({ request }) => {
    const recipient = await seedRecipient("forged@test.com");

    // Tokens are HMAC-signed so a recipient can't fabricate opens for someone else.
    const response = await request.get(`/api/track/open/not-a-real-token`);

    expect(response.status()).toBe(200); // never leak whether the token was valid
    const row = await prisma.emailRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    expect(row.openedAt).toBeNull();
    expect(row.deliveryStatus).toBe("SENT");
  });

  test("clicking a tracked link records the click and backfills the open", async ({ request }) => {
    const recipient = await seedRecipient("clicker@test.com");
    const token = generateClickToken(recipient.id, campaignId, "https://example.com/landing");

    const response = await request.get(`/api/track/click/${token}`, { maxRedirects: 0 });

    expect([301, 302, 303, 307, 308]).toContain(response.status());
    expect(response.headers()["location"]).toBe("https://example.com/landing");

    const row = await prisma.emailRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    expect(row.clickedAt).not.toBeNull();
    // A click implies an open even when the pixel was blocked — without this the
    // open count silently undercounts the most engaged recipients.
    expect(row.openedAt).not.toBeNull();
    expect(row.deliveryStatus).toBe("CLICKED");
  });

  test("a pixel-recorded open moves the campaign's Opened tile and Open Rate", async ({ page, request }) => {
    const delivered = await prisma.emailRecipient.create({
      data: {
        campaignId, organizationId, userId: parentId, email: "rate-a@test.com",
        recipientType: "PARENT", deliverySource: "CAMPAIGN",
        deliveryStatus: "DELIVERED", sentAt: new Date(), deliveredAt: new Date(),
      },
    });
    await prisma.emailRecipient.create({
      data: {
        campaignId, organizationId, userId: parentId, email: "rate-b@test.com",
        recipientType: "PARENT", deliverySource: "CAMPAIGN",
        deliveryStatus: "DELIVERED", sentAt: new Date(), deliveredAt: new Date(),
      },
    });

    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");

    await request.get(`/api/track/open/${generateOpenToken(delivered.id, campaignId)}`);

    await page.goto(`/admin/communication/campaigns/${campaignId}`);
    await expect(page.getByText("E2E Tracking Campaign")).toBeVisible({ timeout: 15000 });

    // Assert the tracked open actually reached the reported statistic, rather
    // than only that it reached the database.
    const opened = Number(await page.getByTestId("stat-opened-value").innerText());
    const deliveredCount = Number(await page.getByTestId("stat-delivered-value").innerText());
    const openRate = await page.getByTestId("stat-open-rate-value").innerText();

    expect(opened).toBeGreaterThan(0);
    expect(openRate).toBe(`${Math.round((opened / deliveredCount) * 100)}%`);
  });
});
