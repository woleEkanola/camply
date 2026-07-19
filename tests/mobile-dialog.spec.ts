import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * Dialog.tsx (src/components/ui/Dialog.tsx) responsive bottom-sheet: full-width
 * and bottom-anchored below `md`, centered and width-capped at `md` and up.
 * Uses the "Add Campus" dialog purely for its geometry — never submits it, so
 * no fixture row is created.
 */
async function openAddCampusDialog(page: import("@playwright/test").Page) {
  // OWNER, not ADMIN: campus.getByOrganization gates ADMIN behind an
  // explicit READ_CAMPUS/UPDATE_CAMPUS grant the seeded admin@camply.com
  // doesn't have; OWNER bypasses that check unconditionally.
  await loginWithPassword(page, "owner@camply.com", "password123");
  await page.goto("/admin/campuses");
  await page.getByRole("button", { name: "Add Campus" }).click();
  const panel = page.getByTestId("dialog-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("Dialog — mobile bottom-sheet", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("panel is full-width and anchored to the bottom edge", async ({ page }) => {
    const panel = await openAddCampusDialog(page);
    const viewport = page.viewportSize()!;
    const box = (await panel.boundingBox())!;

    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 5);
    expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 5);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).not.toBeVisible();
  });
});

test.describe("Dialog — desktop centered card", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("panel is width-capped and vertically centered, not edge-anchored", async ({ page }) => {
    const panel = await openAddCampusDialog(page);
    const viewport = page.viewportSize()!;
    const box = (await panel.boundingBox())!;

    // size="md" -> max-w-md (28rem/448px); well short of a 1280px viewport.
    expect(box.width).toBeLessThan(500);
    // A real gap above and below means it's centered, not flush to an edge.
    expect(box.y).toBeGreaterThan(40);
    expect(viewport.height - (box.y + box.height)).toBeGreaterThan(40);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).not.toBeVisible();
  });
});
