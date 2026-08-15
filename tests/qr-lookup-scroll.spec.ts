import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Scan Center - QR Identity Lookup modal viewport & scroll safety", () => {
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

    camperName = `E2E Lookup Teen ${Date.now()}`;
    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "E2E",
        lastName: "LookupTeen",
        gender: "Male",
        dateOfBirth: new Date(2010, 0, 17),
        userId: owner.id,
        organizationId,
        homeCampusId: campusId,
        allergies: "None",
        medicalConditions: "None",
      },
    });
    camperId = camper.id;

    const seq = Math.floor(Math.random() * 10000);
    registrationNumber = `TST-LOOKUP-${String(seq).padStart(5, "0")}`;

    const registration = await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId,
        campId,
        campusId,
        registrationNumber,
        qrToken: `e2e-lookup-token-${Date.now()}`,
        approvedAt: new Date(),
      },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.scanEvent.deleteMany({ where: { registrationId } });
    await prisma.registration.delete({ where: { id: registrationId } });
    await prisma.camper.delete({ where: { id: camperId } });
  });

  test("lookup overlay displays camper header, avatar, status and campus contacts at the top without clipping", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    // Identity Lookup is the default station
    await expect(page.getByRole("heading", { name: "Identity Lookup" })).toBeVisible();

    const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // The modal overlay should appear
    const camperHeading = page.getByRole("heading", { name: camperName, exact: true });
    await expect(camperHeading).toBeVisible({ timeout: 10000 });

    // Verify registration number and status are visible
    await expect(page.getByText(registrationNumber)).toBeVisible();
    await expect(page.getByText("APPROVED")).toBeVisible();

    // Verify Campus Contacts section is rendered
    await expect(page.getByText("Campus Contacts")).toBeVisible();

    // Ensure the top camper name is within the visible viewport bounds (not pushed above top y < 0)
    const boundingBox = await camperHeading.boundingBox();
    expect(boundingBox).not.toBeNull();
    expect(boundingBox!.y).toBeGreaterThanOrEqual(0);

    // Close the overlay using the close X button
    const closeBtn = page.getByRole("button", { name: "Close" });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Overlay is dismissed and scanner resumes
    await expect(camperHeading).not.toBeVisible();
    await expect(page.getByTestId("scanner-video")).toBeVisible();
  });
});
