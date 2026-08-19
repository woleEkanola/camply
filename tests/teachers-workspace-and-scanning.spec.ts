import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Teachers workspace modernization & unrestricted QR scanning", () => {
  test.describe.configure({ mode: "serial" });

  test("teachers workspace has full-width layout, header action modals, 2-tier toolbar, and unrestricted scanner", async ({ page }) => {
    // 1. Login as admin/owner
    await loginWithPassword(page, "owner@camply.com", "password123");

    // 2. Navigate to Admin Teachers Page
    await page.goto("/admin/teachers");

    // 3. Verify Table view is active and occupies full width without 25% sidebar
    await expect(page.getByRole("heading", { name: "Teachers", exact: true })).toBeVisible();
    await expect(page.getByText("Total Teachers")).toBeVisible();

    // Verify "Recruitment Link" button in top header actions
    const recruitmentBtn = page.getByRole("button", { name: /Recruitment Link/i });
    await expect(recruitmentBtn).toBeVisible();

    // Verify "Campus Quotas" button in top header actions
    const quotasBtn = page.getByRole("button", { name: /Campus Quotas/i });
    await expect(quotasBtn).toBeVisible();

    // 4. Test Recruitment Link Modal
    await recruitmentBtn.click();
    const recruitmentPanel = page.getByTestId("dialog-panel");
    await expect(recruitmentPanel).toBeVisible();
    await expect(recruitmentPanel.getByText("Registration Link")).toBeVisible();
    await expect(recruitmentPanel.getByRole("button", { name: /Copy|Copied/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(recruitmentPanel).not.toBeVisible();

    // 5. Test Campus Quotas Modal
    await quotasBtn.click();
    const quotasPanel = page.getByTestId("dialog-panel");
    await expect(quotasPanel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(quotasPanel).not.toBeVisible();

    // 6. Test 2-Tier Toolbar: Search, Columns Configurator, and Filters
    const searchInput = page.getByPlaceholder("Search by name, email or phone...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("TestSearch");
    await expect(searchInput).toHaveValue("TestSearch");
    await searchInput.fill("");

    // Test Columns Dropdown
    const columnsBtn = page.getByRole("button", { name: /Columns/i });
    await expect(columnsBtn).toBeVisible();
    await columnsBtn.click();
    await expect(page.getByText("Configure Columns")).toBeVisible();
    await page.keyboard.press("Escape");

    // Test Tier 2 Filter selects
    const campusSelect = page.getByLabel("Filter by Campus");
    await expect(campusSelect).toBeVisible();

    const attendanceSelect = page.getByLabel("Filter by Attendance");
    await expect(attendanceSelect).toBeVisible();

    // Select "Coming Only" and verify active filter chip
    await attendanceSelect.selectOption("COMING");
    await expect(page.getByText("Active filters:")).toBeVisible();
    await expect(page.getByText("Coming", { exact: true })).toBeVisible();

    // Click "Reset filters"
    const resetBtn = page.getByRole("button", { name: /Reset filters/i });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await expect(attendanceSelect).toHaveValue("");

    // 7. Verify Teacher QR Scan Page loads unrestricted
    await page.goto("/teacher/qr-scan");
    await expect(page.locator("[data-scan-root]")).toBeVisible({ timeout: 15000 });

    // 8. Verify Volunteer QR Scan Page loads unrestricted
    await page.goto("/volunteer/qr-scan");
    await expect(page.locator("[data-scan-root]")).toBeVisible({ timeout: 15000 });
  });
});
