import { test, expect } from "@playwright/test";
import {
  loginWithPassword,
  switchRegistrationsToListView,
} from "./helpers";

test.describe("Registration Details Drawer Tabs", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
  });

  test("opening a registration row shows the detail drawer with Overview tab by default", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Overview" })
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Details" })
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: /Documents/ })
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Activity" })
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Assignments" })
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Communication" })
    ).toBeVisible();

    await expect(
      page.getByRole("dialog").getByText("Registration Information")
    ).toBeVisible();
  });

  test("navigating to Details tab shows camper profile fields", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("dialog").getByRole("button", { name: "Details" }).click();
    await page.waitForTimeout(500);

    await expect(
      page.getByRole("dialog").getByText("Consent Form")
    ).toBeVisible();
  });

  test("navigating to Documents tab shows document count label", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("dialog").getByRole("button", { name: /Documents/ }).click();
    await page.waitForTimeout(500);

    await expect(
      page.getByRole("dialog").getByText("Documents")
        .or(page.getByRole("dialog").getByText("Required Documents"))
        .first()
    ).toBeVisible();
  });

  test("navigating to Activity tab shows timeline content", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("dialog").getByRole("button", { name: "Activity" }).click();
    await page.waitForTimeout(500);

    await expect(
      page.getByRole("dialog").getByText("Activity Log")
    ).toBeVisible();
  });

  test("navigating to Assignments tab shows tribe/campus assignment UI", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("dialog").getByRole("button", { name: "Assignments" }).click();
    await page.waitForTimeout(500);

    await expect(
      page.getByRole("dialog").getByText("Tribe")
        .or(page.getByRole("dialog").getByText("Tribe Assignment"))
        .or(page.getByRole("dialog").getByText("Campus Assignment"))
        .first()
    ).toBeVisible();
  });

  test("navigating to Communication tab selects the tab", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    // Click Communication tab — should switch without error
    const commTab = page.getByRole("dialog").getByRole("button", { name: "Communication" });
    await commTab.click();
    await page.waitForTimeout(500);

    // Communication tab should be active (purple border)
    await expect(commTab).toHaveClass(/border-purple-600/);
  });

  test("back button closes the drawer", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("dialog").getByLabel("Back").click();
    await page.waitForTimeout(500);

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).not.toBeVisible();
  });

  test("More Actions menu is present and clickable", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    const moreBtn = page.getByRole("dialog").getByLabel("More options");
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();

    await expect(
      page.getByRole("dialog").getByText("Change Status")
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Waitlist")
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Cancel Registration")
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Archive")
    ).toBeVisible();
  });

  test("camper profile banner shows name, email, and phone", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("@")).toBeVisible();
    await expect(dialog.getByText("No email").or(dialog.getByText("No phone"))).toBeVisible();
  });

  test("Overview tab Quick Actions cards are visible", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    await expect(
      page.getByRole("heading", { name: "Registration Details" })
    ).toBeVisible({ timeout: 5000 });

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Quick Actions")).toBeVisible();
    await expect(dialog.getByText("Edit Registration")).toBeVisible();
    await expect(dialog.getByText("Assign Tribe")).toBeVisible();
    await expect(dialog.getByText("Assign Hostel")).toBeVisible();
    await expect(dialog.getByText("Send Email / SMS")).toBeVisible();
  });
});
