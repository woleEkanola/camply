import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, ensureCamperSignupLink } from "./helpers";

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

    // Address (AddressCell in campuses/page.tsx) collapses behind a toggle on
    // mobile — not rendered until expanded. exact:true throughout this test —
    // the card's outer div has role="button" too (onRowClick opens the detail
    // dialog) with no aria-label, so its accessible name falls back to its full
    // text content, which includes every nested button's own text.
    const showAddressBtn = card.getByRole("button", { name: "Show address", exact: true });
    await expect(showAddressBtn).toBeVisible();
    await expect(card.locator("p")).toHaveCount(0);
    await showAddressBtn.click();
    await expect(card.getByRole("button", { name: "Hide address", exact: true })).toBeVisible();
    await expect(card.locator("p")).toBeVisible();

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

  test("setting a numeric quota renders it as a progress bar", async ({ page }) => {
    const { campusName } = await getFixtureOrgContext();
    // The quota UI (Set Quota button, used/limit column) only renders once the
    // campus has a SignupLink — quota is a SignupLink field, not a Campus one.
    // Idempotent: reuses an existing link or creates+activates one.
    await ensureCamperSignupLink();

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    const card = page.locator("li", { hasText: campusName }).first();
    await expect(card).toBeVisible();

    // A quota of 0 ("no limit") stays text-only — no denominator to show a
    // fill against — so set a real quota to exercise the ProgressBar path.
    // exact:true — see the note in the previous test about the card's own
    // role="button" wrapper absorbing nested button text into its accessible name.
    await card.getByRole("button", { name: "Set Quota", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Set Campus Quota")).toBeVisible();
    const quotaInput = dialog.getByLabel("Registration Quota (0 = unlimited)");
    const originalValue = (await quotaInput.inputValue()) || "0";
    await quotaInput.fill("10");
    await dialog.getByRole("button", { name: "Save Quota" }).click();
    await expect(dialog).not.toBeVisible();

    try {
      const bar = card.getByRole("progressbar");
      await expect(bar).toBeVisible();
      await expect(bar).toHaveAttribute("aria-valuenow", /^\d+$/);
      await expect(card.getByText(/\/ 10\b/)).toBeVisible();
    } finally {
      // Restore — this is the shared fixture campus other specs also rely on.
      await card.getByRole("button", { name: "Set Quota", exact: true }).click();
      await dialog.getByLabel("Registration Quota (0 = unlimited)").fill(originalValue);
      await dialog.getByRole("button", { name: "Save Quota" }).click();
      await expect(dialog).not.toBeVisible();
    }
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

    // AddressCell's collapse toggle is mobile-only — desktop keeps the full
    // address inline in the table cell, same as before this change.
    const row = page.locator("tr", { hasText: campusName });
    await expect(row.getByRole("button", { name: "Show address" })).toHaveCount(0);

    await row.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Edit Campus")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  });
});
