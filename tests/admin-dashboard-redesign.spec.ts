import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Admin Dashboard Redesign", () => {
  test.describe.configure({ mode: "serial" });

  test("renders all dashboard sections", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await expect(page).toHaveURL(/\/admin$/);

    const main = page.locator("main");

    await expect(
      main.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();

    await expect(page.getByTestId("stat-card-parents")).toBeVisible();
    await expect(page.getByTestId("stat-card-admins")).toBeVisible();
    await expect(page.getByTestId("stat-card-campers")).toBeVisible();
    await expect(page.getByTestId("stat-card-campuses")).toBeVisible();

    await expect(main.getByRole("heading", { name: "Quick Actions" })).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "Today's Summary" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "Recent Registrations" })
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "Organization Overview" })
    ).toBeVisible();
    await expect(main.getByText(/You're all caught up/)).toBeVisible();
  });

  test("quick action cards have correct navigation hrefs", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await expect(page).toHaveURL(/\/admin$/);

    await expect(page.getByTestId("quick-action-registrations")).toHaveAttribute(
      "href",
      /\/admin\/registrations/
    );
    await expect(page.getByTestId("quick-action-checkin")).toHaveAttribute(
      "href",
      /\/admin\/check-in/
    );
    await expect(page.getByTestId("quick-action-add-camper")).toHaveAttribute(
      "href",
      /\/admin\/campers/
    );
    await expect(page.getByTestId("quick-action-communication")).toHaveAttribute(
      "href",
      /\/admin\/communication/
    );
    await expect(page.getByTestId("quick-action-campuses")).toHaveAttribute(
      "href",
      /\/admin\/campuses/
    );
  });

  test("stat cards have correct navigation hrefs", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await expect(page).toHaveURL(/\/admin$/);

    await expect(page.getByTestId("stat-card-parents")).toHaveAttribute("href", "/admin/users");
    await expect(page.getByTestId("stat-card-admins")).toHaveAttribute("href", "/admin/access-control");
    await expect(page.getByTestId("stat-card-campers")).toHaveAttribute("href", "/admin/campers");
    await expect(page.getByTestId("stat-card-campuses")).toHaveAttribute("href", "/admin/campuses");
  });

  test("mobile viewport has no horizontal overflow", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForLoadState("networkidle");

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
