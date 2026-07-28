import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * The admin sidebar's "Communication" and "Settings" groups (navConfig.ts)
 * are the two largest sections (10 and 5 child links) — they now render as
 * click-to-expand headers, collapsed by default, instead of always-visible
 * flat lists like every other group (Dashboard/Registration/Organization/etc).
 */
test.describe("Nav: collapsible Communication/Settings groups", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Communication/Settings start collapsed and expand on click; other groups stay flat", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    // Scope to the sidebar <nav> — "Campers"/"Campaigns" etc. also appear as
    // dashboard StatCard links, which would otherwise collide (strict mode).
    const nav = page.locator("nav").first();

    // Non-collapsible group's items are always visible — no regression there.
    await expect(nav.getByRole("link", { name: "Campers", exact: true })).toBeVisible();

    // Communication's children are hidden until its header is clicked.
    await expect(nav.getByRole("link", { name: "Campaigns", exact: true })).not.toBeVisible();
    const communicationHeader = nav.getByRole("button", { name: "Communication" });
    await expect(communicationHeader).toBeVisible();
    await communicationHeader.click();
    await expect(nav.getByRole("link", { name: "Campaigns", exact: true })).toBeVisible();

    // Settings' children are likewise hidden until clicked, independent of Communication.
    await expect(nav.getByRole("link", { name: "Access Control", exact: true })).not.toBeVisible();
    const settingsHeader = nav.getByRole("button", { name: "Settings" });
    await settingsHeader.click();
    await expect(nav.getByRole("link", { name: "Access Control", exact: true })).toBeVisible();

    // Collapsing Communication again hides its children without affecting Settings.
    await communicationHeader.click();
    await expect(nav.getByRole("link", { name: "Campaigns", exact: true })).not.toBeVisible();
    await expect(nav.getByRole("link", { name: "Access Control", exact: true })).toBeVisible();
  });

  test("deep-linking into a Communication sub-route auto-expands the group", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/communication/campaigns");
    const nav = page.locator("nav").first();
    // Session/role resolves client-side after the initial hard navigation
    // (getNavGroups returns [] until `role` is known), so the nav — and the
    // auto-expand effect that depends on it — can take a beat longer here
    // than on a same-session client-side navigation.
    await expect(nav.getByRole("link", { name: "Campaigns", exact: true })).toBeVisible({ timeout: 15000 });
  });
});
