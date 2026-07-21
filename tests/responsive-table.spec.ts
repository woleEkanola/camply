import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, findCampusCard, prisma } from "./helpers";

/**
 * Campuses page is a card grid on both mobile and desktop (no dual-render
 * table/cards Table component). Verifies cards render, actions work, and
 * capacity UI shows when a signup link has a numeric quota.
 */
test.describe("Campus cards — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows campus cards and an in-card Edit opens the dialog", async ({ page }) => {
    const { campusName } = await getFixtureOrgContext();

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible();

    await expect(page.getByRole("table")).toHaveCount(0);
    const card = await findCampusCard(page, campusName);
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Edit Campus")).toBeVisible();
    await expect(dialog.locator("#name")).toHaveValue(campusName);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("numeric quota renders capacity on the campus card", async ({ page }) => {
    const { campusName, campusId, campId } = await getFixtureOrgContext();

    // Ensure a signup link with quota=10 exists for the fixture campus
    const existing = await prisma.signupLink.findUnique({
      where: { campusId_campId: { campusId, campId } },
    });
    const originalQuota = existing?.quota ?? 0;
    if (existing) {
      await prisma.signupLink.update({ where: { id: existing.id }, data: { quota: 10, active: true } });
    } else {
      await prisma.signupLink.create({
        data: { token: `e2e-quota-${Date.now()}`, campusId, campId, active: true, quota: 10 },
      });
    }

    try {
      await loginWithPassword(page, "owner@camply.com", "password123");
      await page.goto("/admin/campuses");
      const card = await findCampusCard(page, campusName);
      await expect(card).toBeVisible();
      await expect(card.getByText(/\/ 10\b/)).toBeVisible({ timeout: 10000 });
    } finally {
      if (existing) {
        await prisma.signupLink.update({ where: { id: existing.id }, data: { quota: originalQuota } });
      }
    }
  });
});

test.describe("Campus cards — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("shows campus cards (grid is the default view)", async ({ page }) => {
    const { campusName } = await getFixtureOrgContext();

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible();

    const card = await findCampusCard(page, campusName);
    await expect(card).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);

    await card.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Edit Campus")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  });
});
