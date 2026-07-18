import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext } from "./helpers";

/**
 * Table.tsx dual-renders a desktop <table> (`hidden md:block`) and a mobile
 * card <ul> (`md:hidden`) from the same columns/data. Verifies the two are
 * mutually exclusive per breakpoint, and that a row action rendered into the
 * card's actions footer (not just the desktop <td>) actually works.
 */
test.describe("Responsive table — mobile cards", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows cards (not the table) and an in-card action opens the row's Edit dialog", async ({ page }) => {
    const { campusName } = await getFixtureOrgContext();

    // OWNER, not ADMIN: campus.getByOrganization gates ADMIN behind an
    // explicit READ_CAMPUS/UPDATE_CAMPUS grant the seeded admin@camply.com
    // doesn't have; OWNER bypasses that check unconditionally.
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible();

    await expect(page.getByRole("table")).not.toBeVisible();
    // Name column is `primary` — promoted to the card's title row.
    const card = page.locator("li", { hasText: campusName }).first();
    await expect(card).toBeVisible();

    // exact:true — the card's outer div has role="button" too (onRowClick
    // opens the detail dialog) with no aria-label, so its accessible name
    // falls back to its full text content, which includes "Edit" itself.
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Edit Campus")).toBeVisible();
    await expect(dialog.locator("#name")).toHaveValue(campusName);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
  });
});

test.describe("Responsive table — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows the table (not cards)", async ({ page }) => {
    const { campusName } = await getFixtureOrgContext();

    // OWNER, not ADMIN: campus.getByOrganization gates ADMIN behind an
    // explicit READ_CAMPUS/UPDATE_CAMPUS grant the seeded admin@camply.com
    // doesn't have; OWNER bypasses that check unconditionally.
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible();

    await expect(page.getByRole("table")).toBeVisible();
    // The mobile <li> card still exists in the DOM at desktop width (dual-render,
    // hidden via an ancestor's `md:hidden`) — assert it's not visible, not absent.
    await expect(page.locator("li", { hasText: campusName }).first()).not.toBeVisible();

    await page.locator("tr", { hasText: campusName }).getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Edit Campus")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  });
});
