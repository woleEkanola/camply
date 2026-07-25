import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Scan Center - feedback layer (auto-dismiss, medical triage)", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campusId: string;
  let campId: string;
  let camperId: string;
  let registrationId: string;
  let camperName: string;
  let registrationNumber: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusId = ctx.campusId;
    campId = ctx.campId;

    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@camply.com" } });

    camperName = `E2E Feedback Camper ${Date.now()}`;
    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "E2E",
        lastName: "Feedback",
        gender: "Female",
        dateOfBirth: new Date(2012, 1, 1),
        userId: owner.id,
        organizationId,
        homeCampusId: campusId,
        allergies: "Peanuts", // routine, INFO severity — should not block
      },
    });
    camperId = camper.id;

    const seq = Math.floor(Math.random() * 10000);
    registrationNumber = `TST-E2E-FDBK-${String(seq).padStart(5, "0")}`;

    const registration = await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId,
        campId,
        campusId,
        registrationNumber,
        qrToken: `e2e-feedback-token-${Date.now()}`,
        approvedAt: new Date(),
      },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.scanEvent.deleteMany({ where: { registrationId } });
    await prisma.mealDistribution.deleteMany({ where: { registrationId } });
    await prisma.registration.delete({ where: { id: registrationId } });
    await prisma.camper.delete({ where: { id: camperId } });
  });

  test("routine allergy renders inline without blocking, and success overlay auto-dismisses within ~2s, resuming scanning", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/check-in");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // Success overlay shows directly — no separate blocking medical screen —
    // with the allergy surfaced inline via the medical note banner.
    const successOverlay = page.getByRole("heading", { name: "Checked In at Camp Arrival", exact: true });
    await expect(successOverlay).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Medical Note")).toBeVisible();
    await expect(page.getByText("Peanuts")).toBeVisible();
    await expect(page.getByText("Critical Medical Alert", { exact: false })).toHaveCount(0);

    // Auto-dismisses without any click — scanner resumes (camera stays live).
    await expect(successOverlay).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId("scanner-video")).toBeVisible();
  });

  test("duplicate scan is framed as informational (blue), not an error, and auto-dismisses", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/check-in");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
    // Already checked in from the previous test — this search hits DUPLICATE.
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    const duplicateOverlay = page.getByRole("heading", { name: "Already Checked In", exact: true });
    await expect(duplicateOverlay).toBeVisible({ timeout: 10000 });
    // No red/error framing anywhere in the duplicate overlay.
    await expect(page.locator(".bg-red-700")).toHaveCount(0);

    await expect(duplicateOverlay).not.toBeVisible({ timeout: 4000 });
  });

  test("a critical medical condition still blocks scanning with a full-screen interrupt requiring acknowledgement", async ({ page }) => {
    test.setTimeout(60000);
    // Escalate to a critical condition and reset check-in state for a fresh scan.
    await prisma.camper.update({
      where: { id: camperId },
      data: { allergies: "Severe peanut anaphylaxis" },
    });
    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "APPROVED", checkedInAt: null, checkedInById: null },
    });
    await prisma.scanEvent.deleteMany({ where: { registrationId } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/check-in");
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    const criticalOverlay = page.getByRole("heading", { name: "Critical Medical Alert" });
    await expect(criticalOverlay).toBeVisible({ timeout: 10000 });
    // Does NOT auto-dismiss — stays blocking until acknowledged.
    await page.waitForTimeout(3000);
    await expect(criticalOverlay).toBeVisible();

    await page.getByRole("button", { name: "Acknowledge & Confirm Scan" }).click();
    await expect(page.getByRole("heading", { name: "Checked In at Camp Arrival", exact: true })).toBeVisible({ timeout: 10000 });
  });
});
