import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, getFixtureOrgContext } from "./helpers";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

test.describe("Volunteer Department Nav Gating & Query Protection E2E Test", () => {
  let volunteerUserId: string;
  let volunteerEmail: string;

  test.beforeAll(async () => {
    const suffix = `${Date.now()}`;
    const ctx = await getFixtureOrgContext();

    volunteerEmail = `general-vol-${suffix}@camply.test`;
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
        firstName: "General",
        lastName: "Volunteer",
        email: volunteerEmail,
        phone: "08012345678",
        volunteerCategory: "General", // Not Medical, Not Kitchen
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

  test("Volunteer without Medical/Kitchen department does not see Medical/Meals in nav bar and no medicalVisit error is thrown", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await loginWithPassword(page, volunteerEmail, "password123");
    await page.goto("/volunteer");

    await page.waitForSelector("text=Volunteer Dashboard", { timeout: 15000 });

    // Verify Nav bar items inside sidebar / bottom nav
    const medicalNavLink = page.locator('nav a:has-text("Medical"), nav button:has-text("Medical")');
    const mealsNavLink = page.locator('nav a:has-text("Meals"), nav button:has-text("Meals")');

    await expect(medicalNavLink).toHaveCount(0);
    await expect(mealsNavLink).toHaveCount(0);

    // Verify no medicalVisit.recent error was thrown in browser console
    const medicalQueryError = consoleErrors.find((err) => err.includes("medicalVisit.recent"));
    expect(medicalQueryError).toBeUndefined();
  });
});
