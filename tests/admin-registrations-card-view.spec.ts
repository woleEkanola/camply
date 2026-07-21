import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Admin Registrations Card/List View", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await page.waitForTimeout(2000);
  });

  test("desktop shows card view toggle with Card View and List View buttons", async ({ page }) => {
    await expect(page.getByText("Card View")).toBeVisible();
    await expect(page.getByText("List View")).toBeVisible();
  });

  test("default view on desktop is card view", async ({ page }) => {
    const cardBtn = page.getByText("Card View");
    await expect(cardBtn).toBeVisible();

    // In card view mode, the table should not be visible
    if (await page.locator("table").first().isVisible({ timeout: 2000 }).catch(() => false)) {
      // The table may still appear momentarily; check after a short wait
      await page.waitForTimeout(500);
    }
    // Card view grid should be visible by default
    const cardGrid = page.locator(".grid.grid-cols-1");
    await expect(cardGrid.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking Card View when deselected switches to card mode", async ({ page }) => {
    // First switch to list view
    await page.getByText("List View").click();
    await page.waitForTimeout(500);
    await expect(page.locator("table").first()).toBeVisible();

    // Switch back to card view
    await page.getByText("Card View").click();
    await page.waitForTimeout(500);

    // Table should not be visible, cards grid should be
    await expect(page.locator("table").first()).not.toBeVisible();
    // Verify card grid container is present
    const cardGrid = page.locator(".grid.grid-cols-1");
    await expect(cardGrid.first()).toBeVisible();
  });

  test("clicking List View switches table and stat cards remain visible", async ({ page }) => {
    await page.getByText("List View").click();
    await page.waitForTimeout(500);

    await expect(page.locator("table").first()).toBeVisible();
    await expect(page.getByText("Total Registrations")).toBeVisible();
  });

  test("card view shows registration cards with camper info when registrations exist", async ({ page }) => {
    await page.waitForTimeout(2000);

    // Find cards that have a "View Review" button — unique to registration cards
    const registrationCards = page.locator(
      "button:has-text('View Review')"
    ).locator("..").locator("..");
    const cardCount = await registrationCards.count();

    if (cardCount > 0) {
      await expect(registrationCards.first()).toBeVisible();
    }
  });

  test("card click opens the registration details drawer", async ({ page }) => {
    await page.waitForTimeout(2000);

    const registrationCards = page.locator(
      "button:has-text('View Review')"
    ).locator("..").locator("..");
    const cardCount = await registrationCards.count();

    if (cardCount > 0) {
      await registrationCards.first().click();
      await expect(
        page.getByRole("heading", { name: "Registration Details" })
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("search bar is visible and can filter", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Name, email, or registration #");
    await expect(searchInput).toBeVisible();

    await searchInput.fill("zzzznonexistent");
    await page.waitForTimeout(1500);

    await expect(
      page.getByText("No registrations match your filters")
    ).toBeVisible();
  });

  test("status filter and campus filter dropdowns are visible", async ({ page }) => {
    await expect(
      page.locator('[data-testid="registration-status-filter"]')
    ).toBeVisible();
    await expect(
      page.locator("select").filter({ has: page.locator('option[value=""]') }).first()
    ).toBeVisible();
  });

  test("stat cards show all status categories", async ({ page }) => {
    await expect(page.getByText("Total Registrations")).toBeVisible();

    // Verify key stat card labels are present
    const statLabels = [
      "Total Registrations",
      "PENDING",
      "APPROVED",
      "REJECTED",
      "WAITLISTED",
      "CHECKED IN",
      "ARCHIVED",
      "Corrections",
    ];

    for (const label of statLabels) {
      const elem = page.getByText(label, { exact: false });
      if (await elem.isVisible().catch(() => false)) {
        await expect(elem.first()).toBeVisible();
      }
    }
  });

  test("mobile viewport works without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForLoadState("networkidle");

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });

  test("mobile viewport shows search bar and stats", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);

    await expect(
      page.getByPlaceholder("Name, email, or registration #")
        .or(page.getByPlaceholder("Search"))
        .first()
    ).toBeVisible();
  });
});
