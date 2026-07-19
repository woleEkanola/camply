import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, showAllRows } from "./helpers";
import { randomBytes } from "crypto";

test.describe("Campuses: Copy Link click propagation", () => {
  let campusId: string | undefined;
  let organizationId: string | undefined;
  let campId: string | undefined;
  const campusName = `E2E Copy Link Propagation Campus ${Date.now()}`;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    // Create a campus
    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        slug: `e2e-copy-link-prop-${Date.now()}`,
        address: "99 Copy Link St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    campusId = campus.id;

    // Create an active signup link for this campus so we have a Copy Link button
    await prisma.signupLink.create({
      data: {
        token: randomBytes(16).toString("hex"),
        campusId: campusId,
        campId,
        active: true,
      },
    });
  });

  test.afterAll(async () => {
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("clicking copy link does not open campus detail drawer", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");

    await showAllRows(page);
    const row = page.locator("tr", { hasText: campusName });
    await expect(row).toBeVisible({ timeout: 10000 });

    const copyButton = row.getByRole("button", { name: /Copy Link/i });
    await expect(copyButton).toBeVisible();

    // Click the Copy Link button
    await copyButton.click();

    // Expect the button text to toggle to "Copied!" or similar
    await expect(row.getByRole("button", { name: /Copied!/i })).toBeVisible({ timeout: 5000 });

    // Verify the details drawer/dialog with the campus name is NOT visible
    const drawerHeader = page.getByRole("dialog").getByRole("heading", { name: campusName });
    await expect(drawerHeader).not.toBeVisible();
  });
});
