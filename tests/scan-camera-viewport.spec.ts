import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Scan Center - immersive camera viewport", () => {
  test("camera is live on load with no launch button", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    // Station is already active (no station-picker landing screen) and the
    // camera viewport is mounted immediately — no "Launch Camera Scanner"
    // button gating it, per the redesign. A fresh session on this
    // check-in route lands on the safe, read-only Identity Lookup station.
    await expect(page.getByRole("heading", { name: "Identity Lookup" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch Camera Scanner" })).toHaveCount(0);
    await expect(page.getByTestId("scanner-video")).toBeVisible();
  });
});
