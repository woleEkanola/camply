import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * Button.tsx sizeClasses and Input.tsx's shared `fieldBase` hit the 44px
 * touch-target guideline (and 16px input font-size, to stop iOS zoom-on-
 * focus) below `md`, then revert to the original compact desktop sizing.
 * Uses the "Add Campus" dialog's real Input/Button instances — never
 * submits, so no fixture row is created.
 */
async function openAddCampusDialog(page: import("@playwright/test").Page) {
  // OWNER, not ADMIN: campus.getByOrganization gates ADMIN behind an
  // explicit READ_CAMPUS/UPDATE_CAMPUS grant the seeded admin@camply.com
  // doesn't have; OWNER bypasses that check unconditionally.
  await loginWithPassword(page, "owner@camply.com", "password123");
  await page.goto("/admin/campuses");
  // FAB on mobile, header button on desktop — first() resolves strict mode
  await page.getByRole("button", { name: "Add Campus" }).first().click();
  await expect(page.getByTestId("dialog-panel")).toBeVisible();
}

test.describe("Touch targets — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Input hits 44px/16px, Button hits 44px", async ({ page }) => {
    await openAddCampusDialog(page);

    const nameInput = page.locator("#name");
    const inputBox = (await nameInput.boundingBox())!;
    expect(inputBox.height).toBeGreaterThanOrEqual(44);
    const fontSize = await nameInput.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);

    // Scoped to the dialog: the header's own "Add Campus" trigger button
    // (same text) is still in the DOM behind the open dialog.
    const submitBtn = page.getByTestId("dialog-panel").getByRole("button", { name: "Add Campus" });
    const btnBox = (await submitBtn.boundingBox())!;
    expect(btnBox.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("Touch targets — desktop revert", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Input and Button revert to compact desktop sizing", async ({ page }) => {
    await openAddCampusDialog(page);

    const nameInput = page.locator("#name");
    const fontSize = await nameInput.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeLessThan(16); // md:text-sm = 14px

    // Scoped to the dialog: the header's own "Add Campus" trigger button
    // (same text) is still in the DOM behind the open dialog.
    const submitBtn = page.getByTestId("dialog-panel").getByRole("button", { name: "Add Campus" });
    const btnBox = (await submitBtn.boundingBox())!;
    expect(btnBox.height).toBeLessThan(44); // Button md size: h-11 (44px) -> md:h-10 (40px)
  });
});
