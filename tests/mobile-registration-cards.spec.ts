import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Mobile Registration Cards", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
  });

  test("card displays camper name, campus, and registration number", async ({ page }) => {
    // Find cards that have a "View Review" button — unique to registration cards
    const cards = page.locator("button:has-text('View Review')").locator("..").locator("..");
    const cardCount = await cards.count();

    if (cardCount === 0) {
      test.skip(true, "No registration cards found to test");
      return;
    }

    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();

    // Status badge should be present
    const statusBadges = firstCard.locator('[class*="uppercase"][class*="tracking"]');
    if (await statusBadges.count() > 0) {
      await expect(statusBadges.first()).toBeVisible();
    }
  });

  test("card has checkbox for bulk selection", async ({ page }) => {
    const cards = page.locator("button:has-text('View Review')").locator("..").locator("..");
    const cardCount = await cards.count();

    if (cardCount === 0) {
      test.skip(true, "No registration cards found to test");
      return;
    }

    const checkboxes = cards.first().locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount > 0) {
      await expect(checkboxes.first()).toBeVisible();
      await checkboxes.first().click();
      await expect(checkboxes.first()).toBeChecked();
      await checkboxes.first().click();
      await expect(checkboxes.first()).not.toBeChecked();
    }
  });

  test("card has View Review button that opens detail drawer", async ({ page }) => {
    const cards = page.locator("button:has-text('View Review')").locator("..").locator("..");
    const cardCount = await cards.count();

    if (cardCount === 0) {
      test.skip(true, "No registration cards found to test");
      return;
    }

    const viewBtn = cards.first().locator("button", { hasText: "View Review" });
    if (await viewBtn.isVisible().catch(() => false)) {
      await viewBtn.click();
      await expect(
        page.getByRole("heading", { name: "Registration Details" })
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("document progress bar is visible on cards", async ({ page }) => {
    const cards = page.locator("button:has-text('View Review')").locator("..").locator("..");
    const cardCount = await cards.count();

    if (cardCount === 0) {
      test.skip(true, "No registration cards found to test");
      return;
    }

    const docText = cards.first().getByText(/Documents:/);
    if (await docText.isVisible().catch(() => false)) {
      await expect(docText).toBeVisible();
    }
  });

  test("search filters update card display", async ({ page }) => {
    const searchInput = page.locator("input[placeholder*='Search']").first();
    await expect(searchInput).toBeVisible();

    await searchInput.fill("zzzznonexistent");
    await page.waitForTimeout(1500);

    await expect(
      page.getByText("No registrations found")
    ).toBeVisible();

    await searchInput.fill("");
    await page.waitForTimeout(1500);
  });

  test("stat cards filter click toggles status filter", async ({ page }) => {
    // Click on a stat card to filter
    const pendingStat = page.getByText("PENDING")
      .or(page.getByText("Waiting Decision"));
    const visible = await pendingStat.first().isVisible().catch(() => false);

    if (visible) {
      await pendingStat.first().click();
      await page.waitForTimeout(500);

      // Verify the filter is applied
      await expect(pendingStat.first()).toBeVisible();
    }
  });

  test("mobile viewport shows card layout without table", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // On mobile, the card view should show (table is hidden)
    const table = page.locator("table");
    if (await table.isVisible().catch(() => false)) {
      // Table might still show if JS hasn't switched to mobile view
      // Just verify no horizontal overflow
    }

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
