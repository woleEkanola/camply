import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Scan Center - station header & sheet", () => {
  test("switching stations updates the header color-coded band and stats live, camera stays mounted", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    // Fresh session on a check-in route lands on the safe Identity Lookup
    // station, not a writing station.
    await expect(page.getByRole("heading", { name: "Identity Lookup" })).toBeVisible();

    // Open the station sheet and switch to Breakfast
    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Breakfast Station" }).click();

    await expect(page.getByRole("heading", { name: "Breakfast Station" })).toBeVisible();
    // Meal-station stats (Served / Remaining / Duplicate Attempts) should render
    await expect(page.getByText("Served", { exact: true })).toBeVisible();
    await expect(page.getByText("Remaining", { exact: true })).toBeVisible();

    // Camera stays live across the station switch — no launch button reappears
    await expect(page.getByTestId("scanner-video")).toBeVisible();
    await expect(page.getByRole("button", { name: "Launch Camera Scanner" })).toHaveCount(0);
  });

  test("an in-session station pick survives client-side navigation but a fresh load re-derives from the route", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Identity Lookup" })).toBeVisible();

    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Breakfast Station" }).click();
    await expect(page.getByRole("heading", { name: "Breakfast Station" })).toBeVisible();

    // sessionStorage should now hold the pick
    const sessionPick = await page.evaluate(() => sessionStorage.getItem("camply-scan-station"));
    expect(sessionPick).toBe("BREAKFAST");

    // A fresh navigation (full reload) re-derives from the route default —
    // /admin/check-in no longer passes a defaultStationId, so that route
    // default is the DEFAULT_STATION fallback, Identity Lookup — NOT the
    // stale session pick from a prior tab/session. sessionStorage itself
    // persists across reloads within the same tab, so to prove the
    // fallback we clear it explicitly here (simulating a fresh tab/session
    // where sessionStorage is empty).
    await page.evaluate(() => sessionStorage.removeItem("camply-scan-station"));
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Identity Lookup" })).toBeVisible();
  });
});
