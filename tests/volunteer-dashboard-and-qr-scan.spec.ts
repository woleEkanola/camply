import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, getFixtureOrgContext } from "./helpers";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

test.describe("Volunteer Dashboard & Universal QR Scan E2E Test", () => {
  test.setTimeout(120_000);
  let volunteerUserId: string;
  let volunteerEmail: string;

  test.beforeAll(async () => {
    const suffix = `${Date.now()}`;
    const ctx = await getFixtureOrgContext();

    volunteerEmail = `dash-vol-${suffix}@camply.test`;
    const volUser = await prisma.user.create({
      data: {
        email: volunteerEmail,
        password: await hashPassword("password123"),
        role: "VOLUNTEER",
        organizationId: ctx.organizationId,
      },
    });
    volunteerUserId = volUser.id;

    await prisma.staffProfile.create({
      data: {
        userId: volUser.id,
        organizationId: ctx.organizationId,
        campId: ctx.campId,
        type: "VOLUNTEER",
        status: "APPROVED",
        firstName: "Operational",
        lastName: "Volunteer",
        email: volunteerEmail,
        phone: "08099887766",
        volunteerCategory: "General Crew",
      },
    });
  });

  test.afterAll(async () => {
    if (volunteerUserId) {
      await prisma.staffProfile.deleteMany({ where: { userId: volunteerUserId } }).catch(() => {});
      await prisma.user.delete({ where: { id: volunteerUserId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("Volunteer logs in and accesses QR Scanner and redesigned dashboard", async ({ page }) => {
    await loginWithPassword(page, volunteerEmail, "password123");
    await page.goto("/volunteer");

    await page.waitForSelector("text=Volunteer Dashboard", { timeout: 15000 });

    // Verify Welcome Greeting & Volunteer Badge
    await expect(page.getByRole("heading", { name: /Welcome back, Operational/ }).first()).toBeVisible();
    await expect(page.getByTitle("VOLUNTEER")).toBeVisible();
    const photoCard = page.getByRole("link", { name: "Upload photo" });
    const welcomeCard = page.getByRole("heading", { name: /Welcome back, Operational/ }).first();
    const positionHeading = page.getByRole("heading", { name: "My position" });
    await expect(photoCard).toBeVisible();
    await expect(positionHeading).toBeVisible();
    const [photoBox, welcomeBox, positionBox] = await Promise.all([photoCard.boundingBox(), welcomeCard.boundingBox(), positionHeading.boundingBox()]);
    expect(photoBox!.y).toBeLessThan(welcomeBox!.y);
    expect(welcomeBox!.y).toBeLessThan(positionBox!.y);

    await page.getByRole("link", { name: /Inbox/ }).first().click();
    await expect(page).toHaveURL(/\/volunteer\/inbox/);
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await page.goto("/volunteer");
    await page.getByRole("link", { name: /Report an incident/ }).first().click();
    await expect(page).toHaveURL(/\/volunteer\/incidents/);
    await page.goto("/volunteer");

    // Verify Universal QR Code Scanner Quick Action card
    const qrScanQuickCard = page.getByRole("button", { name: /Primary Tool QR Code Scanner/ });
    await expect(qrScanQuickCard).toBeVisible();

    // Click QR Scanner Quick Action card
    await qrScanQuickCard.click();
    await page.waitForURL(/\/volunteer\/qr-scan/, { timeout: 10000 });
    await expect(page.locator("text=Access Denied")).toHaveCount(0);

    // Navigate back to volunteer dashboard
    await page.goto("/volunteer");
    await page.waitForSelector("text=Volunteer Dashboard", { timeout: 15000 });

    // Verify Emergency Contacts card
    await expect(page.getByRole("heading", { name: /Emergency Contacts & Support Desk/ }).first()).toBeVisible();
    await expect(page.getByText("Camp Director", { exact: true }).first()).toBeVisible();
  });
});
