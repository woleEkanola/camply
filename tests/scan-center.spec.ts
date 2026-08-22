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
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Log in and go to admin check-in
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    // A fresh session lands on Identity Lookup (the safe, read-only
    // default) — explicitly switch to Camp Arrival for this check-in test.
    await expect(page.getByRole("heading", { name: "Identity Lookup" })).toBeVisible();
    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Camp Arrival" }).click();
    await expect(page.getByRole("heading", { name: "Camp Arrival" })).toBeVisible();

    const searchCamper = async () => {
      await page.getByRole("button", { name: "Smart Search" }).click();
      const searchInput = page.locator("input[placeholder='Name, registration #, or phone...']");
      await expect(searchInput).toBeVisible();
      await searchInput.fill(registrationNumber);
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Search", exact: true }).click();
    };

    // 2. Search for the camper manually using smart search
    await searchCamper();

    // 3. Verify green Success Overlay pops up
    const successOverlay = page.getByRole("heading", { name: "Checked In at Camp", exact: true });
    await expect(successOverlay).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(camperName).first()).toBeVisible();

    // Dismiss overlay by clicking close button
    await page.getByRole("button", { name: "Close popup" }).click();
    await expect(successOverlay).not.toBeVisible();
    await page.waitForTimeout(500);
 
    // 4. Search again to verify Duplicate Blue Overlay triggers (no error!)
    await searchCamper();
 
    const duplicateOverlay = page.getByRole("heading", { name: "Already Checked In", exact: true });
    await expect(duplicateOverlay).toBeVisible({ timeout: 20000 });

    // Dismiss duplicate overlay
    await page.getByRole("button", { name: "Close popup" }).click();
    await expect(duplicateOverlay).not.toBeVisible();
  });

  test("allows switching stations, handles meals success and duplicate meal warning", async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 800 });

    // Pre-check-in the camper so the scan serves a meal rather than auto-checking them in
    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    // 1. Open the station sheet and select "Breakfast Station"
    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Breakfast Station" }).click();

    // Verify active station header changes
    await expect(page.getByRole("heading", { name: "Breakfast Station" })).toBeVisible();

    const searchCamper = async () => {
      await page.getByRole("button", { name: "Smart Search" }).click();
      const searchInput = page.locator("input[placeholder='Name, registration #, or phone...']");
      await expect(searchInput).toBeVisible();
      await searchInput.fill(registrationNumber);
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Search", exact: true }).click();
    };

    // 2. Search for camper to serve Breakfast
    await searchCamper();

    // 3. Verify green success overlay displays "Served breakfast"
    const successOverlay = page.locator("text=Served breakfast");
    await expect(successOverlay).toBeVisible({ timeout: 15000 });

    // Dismiss
    await page.getByRole("button", { name: "Close popup" }).click();
    await expect(successOverlay).not.toBeVisible();

    // 4. Search again to check duplicate meal warning
    await searchCamper();

    // Verify blue duplicate overlay, station-specific copy
    const duplicateOverlay = page.getByRole("heading", { name: "Already Collected Breakfast", exact: true });
    await expect(duplicateOverlay).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Breakfast already collected.")).toBeVisible();

    // Dismiss
    await page.getByRole("button", { name: "Close popup" }).click();
  });
});