import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Scan Center - Pickup Point picker, Collectibles, lookup overlay contacts", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campusId: string;
  let campusName: string;
  let campId: string;
  let camperId: string;
  let registrationId: string;
  let registrationNumber: string;
  let repUserId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusId = ctx.campusId;
    campusName = ctx.campusName;
    campId = ctx.campId;

    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@camply.com" } });

    const camper = await prisma.camper.create({
      data: {
        name: `E2E Pickup Camper ${Date.now()}`,
        firstName: "E2E",
        lastName: "Pickup",
        gender: "Male",
        dateOfBirth: new Date(2012, 1, 1),
        userId: owner.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    const seq = Math.floor(Math.random() * 10000);
    registrationNumber = `TST-E2E-PKUP-${String(seq).padStart(5, "0")}`;
    const registration = await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId,
        campId,
        campusId,
        registrationNumber,
        qrToken: `e2e-pickup-token-${Date.now()}`,
        approvedAt: new Date(),
      },
    });
    registrationId = registration.id;

    // Campus rep with a phone number, for the lookup-overlay contact footer.
    const rep = await prisma.user.create({
      data: {
        email: `e2e-camprep-${Date.now()}@camply.test`,
        password: "x",
        role: "CAMPUS_REPRESENTATIVE",
        organizationId,
        firstName: "Rep",
        lastName: "Contact",
        phone: "+2348012345678",
      },
    });
    repUserId = rep.id;
    await prisma.campus.update({ where: { id: campusId }, data: { reps: { connect: { id: rep.id } } } });
  });

  test.afterAll(async () => {
    await prisma.scanEvent.deleteMany({ where: { registrationId } });
    await prisma.registration.delete({ where: { id: registrationId } });
    await prisma.camper.delete({ where: { id: camperId } });
    await prisma.campus.update({ where: { id: campusId }, data: { reps: { disconnect: { id: repUserId } } } });
    await prisma.user.delete({ where: { id: repUserId } });
  });

  test("Pickup Point: picking a campus from the searchable list sets the station label", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Pickup Point Check-in" }).click();

    // Sub-name sheet opens instead of immediately closing.
    await expect(page.getByRole("heading", { name: "Choose Pickup Point" })).toBeVisible();
    await page.getByPlaceholder("Search campuses…").fill(campusName.slice(0, 4));
    await page.getByRole("button", { name: new RegExp(campusName) }).click();

    // Station header now shows the chosen campus as the pickup point label.
    await expect(page.getByRole("heading", { name: campusName })).toBeVisible();
  });

  test("Pickup Point: a custom location text entry also works", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Pickup Point Check-in" }).click();
    await expect(page.getByRole("heading", { name: "Choose Pickup Point" })).toBeVisible();

    await page.getByPlaceholder("e.g. Third Mainland Bridge Bus Stop").fill("Custom Bus Stop E2E");
    await page.getByRole("button", { name: "Use" }).click();

    await expect(page.getByRole("heading", { name: "Custom Bus Stop E2E" })).toBeVisible();
  });

  test("Collectibles: recording an item collection does not mark the camper checked in", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Change station" }).click();
    await page.getByRole("button", { name: "Collectibles" }).click();
    await expect(page.getByRole("heading", { name: "What's being collected?" })).toBeVisible();
    await page.getByPlaceholder(/Gift Bags/).fill("Gift Bags");
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page.getByRole("heading", { name: "Gift Bags" })).toBeVisible();

    const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Collected Gift Bags", exact: true })).toBeVisible({ timeout: 10000 });

    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(reg.status).toBe("APPROVED");
    expect(reg.checkedInAt).toBeNull();

    // Re-scanning the same checkpoint the same day is an informational duplicate.
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Already Collected" })).toBeVisible({ timeout: 10000 });
  });

  test("lookup overlay: X button dismisses (backdrop tap does not), campus rep Call link renders", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");
    await page.waitForLoadState("networkidle");

    // Fresh session default is already Identity Lookup.
    await expect(page.getByRole("heading", { name: "Identity Lookup" })).toBeVisible();

    const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
    await searchInput.fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    const closeButton = page.getByRole("button", { name: "Close" });
    await expect(closeButton).toBeVisible({ timeout: 10000 });

    // Tapping the backdrop must NOT dismiss.
    await page.mouse.click(10, 10);
    await expect(closeButton).toBeVisible();

    // Campus rep contact footer with a working tel: Call link.
    await expect(page.getByText("Rep Contact")).toBeVisible();
    const callLink = page.locator('a[href="tel:+2348012345678"]');
    await expect(callLink).toBeVisible();

    // X button dismisses.
    await closeButton.click();
    await expect(closeButton).not.toBeVisible();
  });
});
