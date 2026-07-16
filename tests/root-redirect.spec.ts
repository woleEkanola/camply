import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, deleteCamperByEmail, loginWithOtp } from "./helpers";

/**
 * Covers a routing bug found while verifying OTP login: src/middleware.ts's
 * DASHBOARD_ROUTE mapped ADMIN to "/dashboard" (the parent-facing Family
 * Dashboard, not the admin dashboard at "/admin") and had no PARENT entry at
 * all, so a signed-in parent visiting "/" was bounced back to /login instead
 * of their dashboard.
 */
test.describe("Visiting '/' while signed in redirects to the correct role dashboard", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-root-redirect-${Date.now()}@camply.test`;

  test.beforeAll(async () => {
    const { organizationId } = await getFixtureOrgContext();
    const passwordHash = await bcrypt.hash("unused-password-not-tested-here", 10);
    await prisma.user.create({
      data: { email: parentEmail, password: passwordHash, role: "PARENT", organizationId, firstName: "Root", lastName: "Redirect" },
    });
  });

  test.afterAll(async () => {
    await deleteCamperByEmail(parentEmail);
  });

  test("an ADMIN visiting '/' lands on /admin, not /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator('button:visible', { hasText: "Password" }).first().click();
    await page.locator('input[placeholder="Enter your email"]:visible').fill("admin@camply.com");
    await page.locator('input[placeholder="Enter Password"]:visible').fill("password123");
    await page.locator('button:visible', { hasText: "Login" }).click();
    await page.waitForURL(/\/(admin|dashboard|super-admin|campus-rep-dashboard)/, { timeout: 15000 });

    await page.goto("/");
    await page.waitForURL(/\/admin(\/|$)/, { timeout: 10000 });
  });

  test("a PARENT visiting '/' lands on /dashboard, not /login", async ({ page }) => {
    await loginWithOtp(page, parentEmail);
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    await page.goto("/");
    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 10000 });
  });
});
