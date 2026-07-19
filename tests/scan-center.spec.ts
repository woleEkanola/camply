import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Scan Center - Unified Operations Platform", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campusId: string;
  let campId: string;
  let camperId: string;
  let registrationId: string;
  let camperName: string;
  let registrationNumber: string;

  test.beforeAll(async () => {
    // Fetch fixture context
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusId = ctx.campusId;
    campId = ctx.campId;

    // Fetch owner user to satisfy the Camper.userId relation
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@camply.com" } });

    // Create a new camper & approved registration for testing scans
    camperName = `E2E Scanner Camper ${Date.now()}`;
    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "E2E",
        lastName: "Scanner",
        gender: "Male",
        dateOfBirth: new Date(2012, 1, 1),
        userId: owner.id, // associate with owner
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    // Generate approved registration with a mock qrToken
    const seq = Math.floor(Math.random() * 10000);
    registrationNumber = `TST-E2E-CAMP-${String(seq).padStart(5, "0")}`;
    
    const registration = await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId,
        campId,
        campusId,
        registrationNumber,
        qrToken: `e2e-token-${Date.now()}`,
        approvedAt: new Date(),
      },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    // Cleanup
    await prisma.scanEvent.deleteMany({ where: { registrationId } });
    await prisma.mealDistribution.deleteMany({ where: { registrationId } });
    await prisma.registration.delete({ where: { id: registrationId } });
    await prisma.camper.delete({ where: { id: camperId } });
  });

  test("processes arrival check-in, triggers green overlay, and reports duplicate with blue overlay", async ({ page }) => {
    test.setTimeout(120000);
    // 1. Log in and go to admin check-in
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/check-in");
    await page.waitForLoadState("networkidle");

    // The default station should be "Camp Arrival"
    await expect(page.getByRole("heading", { name: "Camp Arrival" })).toBeVisible();

    // 2. Search for the camper manually using fallback query input
    const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // 3. Verify green Success Overlay pops up
    const successOverlay = page.getByRole("heading", { name: "Checked In at Camp Arrival", exact: true });
    await expect(successOverlay).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(camperName).first()).toBeVisible();

    // Dismiss overlay by clicking it
    await page.click("text=Checked In at Camp Arrival");
    await expect(successOverlay).not.toBeVisible();
    await page.waitForTimeout(1000);
 
    // 4. Search again to verify Duplicate Blue Overlay triggers (no error!)
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();
 
    const duplicateOverlay = page.locator("text=Already Recorded");
    await expect(duplicateOverlay).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Camp Arrival already recorded offline.")).not.toBeVisible(); // server duplicate message
    await expect(page.getByText("Camper already checked in at Camp Arrival")).toBeVisible();
 
    // Dismiss duplicate overlay
    await page.click("text=Already Recorded");
    await expect(duplicateOverlay).not.toBeVisible();
  });

  test("allows switching stations, handles meals success and duplicate meal warning", async ({ page }) => {
    test.setTimeout(120000);
    // Pre-check-in the camper so the scan serves a meal rather than auto-checking them in
    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/check-in");
    await page.waitForLoadState("networkidle");

    // 1. Click "Change Station" and select "Breakfast Station"
    await page.getByRole("button", { name: "Change Station" }).click();
    await page.getByRole("button", { name: "Breakfast Station" }).click();

    // Verify active station header changes
    await expect(page.getByRole("heading", { name: "Breakfast Station" })).toBeVisible();

    // 2. Search for camper to serve Breakfast
    const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // 3. Verify green success overlay displays "Served breakfast"
    const successOverlay = page.locator("text=Served breakfast");
    await expect(successOverlay).toBeVisible({ timeout: 10000 });

    // Dismiss
    await page.click("text=Served breakfast");
    await expect(successOverlay).not.toBeVisible();

    // 4. Search again to check duplicate meal warning
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // Verify blue duplicate overlay
    const duplicateOverlay = page.locator("text=Already Recorded");
    await expect(duplicateOverlay).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Breakfast already collected.")).toBeVisible();

    // Dismiss
    await page.click("text=Already Recorded");
  });
});
