import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Scan Center - Seamless QR Checkout Flow", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campusId: string;
  let campId: string;
  let camperId: string;
  let registrationId: string;
  let camperName: string;
  let registrationNumber: string;
  let qrToken: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusId = ctx.campusId;
    campId = ctx.campId;

    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@camply.com" } });

    camperName = `E2E Checkout Camper ${Date.now()}`;
    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "E2E",
        lastName: "Checkout",
        gender: "Female",
        dateOfBirth: new Date(2013, 5, 15),
        userId: owner.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    const seq = Math.floor(Math.random() * 10000);
    registrationNumber = `TST-E2E-OUT-${String(seq).padStart(5, "0")}`;
    qrToken = `e2e-checkout-token-${Date.now()}`;

    const registration = await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId,
        campId,
        campusId,
        registrationNumber,
        qrToken,
        approvedAt: new Date(),
      },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.scanEvent.deleteMany({ where: { registrationId } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
  });

  test("defaults to seamless 1-scan checkout, allows undo, reports duplicate, and toggles guardian form mode", async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Log in and go to admin qr-scan
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    // 2. Switch station to Checkout Desk
    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Checkout Desk" }).click();
    await expect(page.getByRole("heading", { name: "Checkout Desk" })).toBeVisible();

    // 3. Verify mode badge shows Quick Scan (Default)
    const modeBadge = page.getByRole("button", { name: /Checkout:\s*(Quick Scan|Guardian Form)/i });
    await expect(modeBadge).toBeVisible();
    await expect(modeBadge).toContainText("Quick Scan");

    // Helper to search and submit in SearchSheet
    const searchCamper = async () => {
      await page.getByRole("button", { name: "Smart Search" }).click();
      const searchInput = page.locator("input[placeholder='Name, registration #, or phone...']");
      await expect(searchInput).toBeVisible();
      await searchInput.fill(registrationNumber);
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Search", exact: true }).click();
    };

    // 4. Perform seamless checkout via Smart Search
    await searchCamper();

    // 5. Verify green Success Overlay pops up directly with "Checked Out"
    const successHeading = page.getByRole("heading", { name: "Checked Out", exact: true });
    await expect(successHeading).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(camperName).first()).toBeVisible();

    // Verify DB updated
    const regInDb = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(regInDb?.checkedOutAt).toBeTruthy();

    // 6. Test Undo from success overlay
    const undoButton = page.getByRole("button", { name: "Undo this scan" });
    await expect(undoButton).toBeVisible();
    await undoButton.click();

    // Success overlay closes and scan is undone
    await expect(successHeading).not.toBeVisible({ timeout: 5000 });
    const regUndone = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(regUndone?.checkedOutAt).toBeNull();

    // 7. Check out again seamlessly
    await searchCamper();
    await expect(page.getByRole("heading", { name: "Checked Out", exact: true })).toBeVisible({ timeout: 15000 });

    // Dismiss overlay by clicking close button
    await page.getByRole("button", { name: "Close popup" }).click();
    await expect(page.getByRole("heading", { name: "Checked Out", exact: true })).not.toBeVisible();

    // 8. Search again to verify Duplicate Scan overlay triggers
    await searchCamper();

    const duplicateOverlay = page.getByRole("heading", { name: "Already Checked Out", exact: true });
    await expect(duplicateOverlay).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Close popup" }).click();

    // 9. Test Guardian Form Mode toggle
    // Click mode badge to switch to Guardian Form
    await modeBadge.click();
    await expect(modeBadge).toContainText("Guardian Form");

    // Reset checkedOutAt in DB for testing Guardian Form flow
    await prisma.scanEvent.deleteMany({ where: { registrationId } });
    await prisma.registration.update({
      where: { id: registrationId },
      data: { checkedOutAt: null, checkedOutById: null },
    });

    // Search and submit camper -> should now prompt Guardian Details Form Overlay
    await searchCamper();

    // Verify Secure Checkout Guardian Form Overlay appears
    await expect(page.getByRole("heading", { name: new RegExp(`Checkout: ${camperName}`, "i") })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Guardian Signature Capture")).toBeVisible();

    // Close the form
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Guardian Signature Capture")).not.toBeVisible();
  });
});