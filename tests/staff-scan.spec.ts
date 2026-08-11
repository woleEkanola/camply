import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail } from "./helpers";
import { ensureStaffQrToken } from "../src/server/staff/idToken";

/**
 * Staff badge scanning in the Scan Centre — a new, separate scan path
 * (processStaffScan / StaffScanEvent) alongside the existing camper flow
 * (processScan / ScanEvent), which stays untouched. Simulates scans via the
 * manual search field, the established pattern for this suite (the camera
 * can't be driven in CI) — see tests/teacher-check-in.spec.ts.
 */
test.describe("Staff badge scanning", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const staffEmail = `e2e-staffscan-${stamp}@camply.test`;
  const staffName = `E2E StaffScan Teacher ${stamp}`;

  let organizationId: string;
  let campId: string;
  let staffProfileId: string;
  let staffQrToken: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const user = await prisma.user.create({
      data: { email: staffEmail, password: "unused", role: "TEACHER", organizationId },
    });
    const profile = await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: staffName,
        lastName: "Badge",
        phone: "+1-555-0900",
        email: staffEmail,
        approvedAt: new Date(),
      },
    });
    staffProfileId = profile.id;
    staffQrToken = await ensureStaffQrToken(prisma, profile.id);
  });

  test.afterAll(async () => {
    await prisma.staffScanEvent.deleteMany({ where: { staffProfileId } });
    await deleteStaffByEmail(staffEmail);
  });

  test("admin checks a staff member in via a Staff Check-In station scan", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");

    await expect(page.getByRole("heading", { name: "Identity Lookup" })).toBeVisible();
    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Staff Check-In" }).click();
    await expect(page.getByRole("heading", { name: "Staff Check-In" })).toBeVisible();

    await page.locator('input[placeholder*="Enter Registration #"]').fill(staffQrToken);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByRole("heading", { name: /Checked In at Staff Check-In/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(staffName)).toBeVisible();

    const event = await prisma.staffScanEvent.findFirst({ where: { staffProfileId, result: "SUCCESS" } });
    expect(event).toBeTruthy();
  });

  test("scanning the same staff badge again at the same station shows Already Checked In", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Staff Check-In" }).click();

    await page.locator('input[placeholder*="Enter Registration #"]').fill(staffQrToken);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Already Checked In" })).toBeVisible({ timeout: 15000 });
  });

  test("scanning a staff badge at a camper station shows a clear error, not a confusing not-found", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Camp Arrival" }).click();
    await expect(page.getByRole("heading", { name: "Camp Arrival" })).toBeVisible();

    await page.locator('input[placeholder*="Enter Registration #"]').fill(staffQrToken);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText(/staff badge/i)).toBeVisible({ timeout: 10000 });
  });
});
