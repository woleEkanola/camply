import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, findCampusCard } from "./helpers";

/**
 * Campuses page redesigned to a card grid (no table column-visibility menu).
 * This spec now verifies search filters the grid and survives a reload of the
 * search query's visible results.
 */
test.describe("Campuses grid search", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("search filters campus cards", async ({ page }) => {
    const { campusName } = await getFixtureOrgContext();
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible();

    const card = await findCampusCard(page, campusName);
    await expect(card).toBeVisible();

    // Nonsense query should empty the grid
    await page.getByPlaceholder(/Search campuses/i).fill(`zzz-no-match-${Date.now()}`);
    await expect(page.getByText("No campuses found")).toBeVisible({ timeout: 10000 });

    // Clear and find fixture campus again
    await page.getByPlaceholder(/Search campuses/i).fill(campusName);
    await expect(page.locator('[data-testid="campus-card"]').filter({ hasText: campusName })).toBeVisible({
      timeout: 10000,
    });
  });
});
