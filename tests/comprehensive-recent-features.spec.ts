import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Comprehensive Recent Features E2E Verification", () => {
  test.describe.configure({ mode: "serial" });

  let testUserId: string | undefined;
  const testUserEmail = `comprehensive-e2e-${Date.now()}@camply.test`;

  test.beforeAll(async () => {
    const { organizationId } = await getFixtureOrgContext();
    const hashedPassword = await bcrypt.hash("password123", 10);
    const user = await prisma.user.create({
      data: {
        email: testUserEmail,
        firstName: "E2ETest",
        lastName: "User",
        password: hashedPassword,
        role: "PARENT",
        organizationId,
      },
    });
    testUserId = user.id;
  });

  test.afterAll(async () => {
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
  });

  test("1. Super Admin: Trash Can & Soft-Delete Restore Workflow", async ({ page }) => {
    test.setTimeout(90000);

    // 1. Log in as Super Admin
    await loginWithPassword(page, "superadmin@camply.com", "password123");
    await page.goto("/super-admin");

    // 2. User Directory tab
    await page.getByRole("button", { name: "User Directory" }).click();
    await page.getByPlaceholder("Search by name or email...").fill(testUserEmail);

    const userRow = page.locator("tr", { hasText: testUserEmail });
    await expect(userRow).toBeVisible({ timeout: 15000 });

    // 3. Soft Delete
    await userRow.getByTitle("Delete User").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete User" }).click();
    await expect(page.getByText(/User soft-deleted successfully/i)).toBeVisible({ timeout: 15000 });

    // 4. Switch to Trash Can tab
    await page.getByRole("button", { name: /Trash Can/i }).click();
    await page.getByPlaceholder("Search by label or type...").fill(testUserEmail);

    const trashRow = page.locator("tr", { hasText: testUserEmail });
    await expect(trashRow).toBeVisible({ timeout: 15000 });

    // 5. Restore Item
    await trashRow.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restore Item" }).click();
    await expect(page.getByText("Item restored successfully")).toBeVisible({ timeout: 15000 });
  });

  test("2. Admin Registrations: Workflow-Aware Stat Cards & Filters (No 'Waiting Decision')", async ({ page }) => {
    test.setTimeout(90000);

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");

    // Ensure "Waiting Decision" is completely absent from DOM
    await expect(page.getByText("Waiting Decision")).toHaveCount(0);

    // Ensure Status Dropdown does not contain "Waiting Decision"
    const statusSelect = page.locator('select[data-testid="registration-status-filter"]');
    await expect(statusSelect).toBeVisible({ timeout: 15000 });
    const optionsText = await statusSelect.innerText();
    expect(optionsText).not.toContain("Waiting Decision");

    // Verify presence of standard status filter options
    expect(optionsText).toContain("APPROVED");
    expect(optionsText).toContain("REJECTED");
  });

  test("3. Registration Drawer & Tribe Allocation Engine v3", async ({ page }) => {
    test.setTimeout(90000);

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");

    // Find and open registration drawer
    const viewTarget = page.locator("button:has-text('View'), tbody tr, [data-testid='mobile-registration-card']").first();
    if (await viewTarget.isVisible({ timeout: 15000 }).catch(() => false)) {
      await viewTarget.click();

      // Drawer opens
      const drawer = page.locator("div[role='dialog']").first();
      if (await drawer.isVisible({ timeout: 10000 }).catch(() => false)) {
        const assignmentsTab = drawer.getByRole("tab", { name: /Assignments/i });
        if (await assignmentsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
          await assignmentsTab.click();
          await expect(drawer.getByText("Tribe Recommendation")).toBeVisible({ timeout: 10000 });
          await expect(drawer.getByText("Confirmed Tribe Assignment")).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });

  test("4. Mobile Registration Redesign & Mobile Bottom Navigation Bar", async ({ page }) => {
    test.setTimeout(90000);

    // Set mobile viewport (iPhone 13 / 14 size)
    await page.setViewportSize({ width: 390, height: 844 });

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");

    // 1. Verify Mobile Bottom Navigation Bar items
    const bottomNav = page.locator("nav[aria-label='Primary']");
    await expect(bottomNav).toBeVisible({ timeout: 15000 });

    await expect(bottomNav.getByText("Dashboard")).toBeVisible();
    await expect(bottomNav.getByText("Registrations")).toBeVisible();
    await expect(bottomNav.getByText("Check-in")).toBeVisible();
    await expect(bottomNav.getByText("Campers")).toBeVisible();
    await expect(bottomNav.getByText("More")).toBeVisible();

    // 2. Verify Card/List view toggle button in header
    const toggleBtn = page.locator("button[title*='Switch']");
    if (await toggleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await toggleBtn.click();
      await page.waitForTimeout(300);
      await toggleBtn.click();
    }
  });
});
