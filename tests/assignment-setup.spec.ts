import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("guided assignment setup", () => {
  test("shows the ordered, fail-safe assignment workflow", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/assignments");

    await expect(page.getByRole("heading", { name: "Assignment Setup" })).toBeVisible();
    await expect(page.getByTestId("assignment-step-1")).toContainText("Build accommodation");
    await expect(page.getByTestId("assignment-step-2")).toContainText("Assign venues");
    await expect(page.getByTestId("assignment-step-3")).toContainText("Assign tribes");
    await expect(page.getByTestId("assignment-step-4")).toContainText("Confirm tribe-first rules");
    await expect(page.getByTestId("assignment-step-5")).toContainText("Preview and assign beds");
    await expect(page.getByText("Auto-assignment never moves someone already assigned.")).toBeVisible();
  });
});
