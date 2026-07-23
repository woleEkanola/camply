import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, switchRegistrationsToListView } from "./helpers";

test.describe("E2E Verification: Duplicate Filtering, Quota Label & Image Cropper", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let userId: string;
  let camperId: string;
  let regId1: string;
  let regId2: string;
  const testEmail = `e2e-dup-parent-${Date.now()}@camply.test`;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Dup Campus ${Date.now()}`,
        slug: `e2e-dup-campus-${Date.now()}`,
        address: "100 Verification Way",
        city: "Test City",
        country: "Testland",
        organizationId,
      },
    });
    campusId = campus.id;

    const parent = await prisma.user.create({
      data: {
        email: testEmail,
        password: "password123",
        role: "PARENT",
        organizationId,
      },
    });
    userId = parent.id;

    const camper = await prisma.camper.create({
      data: {
        name: "Duplicate Child Test",
        firstName: "Duplicate",
        lastName: "Child",
        userId: parent.id,
        organizationId,
        homeCampusId: campus.id,
        photoUrl: "https://images.unsplash.com/photo-1544717305-2782549b5136?w=200",
      },
    });
    camperId = camper.id;

    // Create 2 registrations for the exact same camper to simulate duplicate
    const reg1 = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId: campus.id,
        status: "PENDING",
      },
    });
    regId1 = reg1.id;

    const reg2 = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId: campus.id,
        status: "SUBMITTED",
      },
    });
    regId2 = reg2.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: [regId1, regId2] } } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  test("1. Registrations Page: Duplicates StatCard and Duplicate Badges", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    // Verify Duplicates StatCard is present and clickable
    const dupCard = page.getByRole("button", { name: /Duplicates/i });
    await expect(dupCard).toBeVisible({ timeout: 10000 });
    await dupCard.click();

    // Verify duplicate camper row is displayed with Duplicate badge
    const camperCell = page.locator("tr", { hasText: "Duplicate Child Test" }).first();
    await expect(camperCell).toBeVisible({ timeout: 10000 });
    await expect(camperCell.getByText("Duplicate", { exact: true })).toBeVisible();
  });

  test("2. Campus Page: Registration Capacity shows Submitted (Drafts excluded) label", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");

    // Verify "Submitted (Drafts excluded)" text is rendered on campus card
    await expect(page.getByText("Submitted (Drafts excluded)").first()).toBeVisible({ timeout: 10000 });
  });

  test("3. Registration Details Drawer: Clickable Header Avatar & Photo Cropper Modal", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    // Click on duplicate camper row to open details drawer
    const row = page.locator("tr", { hasText: "Duplicate Child Test" }).first();
    await row.click();

    // Verify drawer opens up
    await expect(page.getByText("Registration Details")).toBeVisible({ timeout: 10000 });

    // Click the top circular avatar thumbnail in drawer header
    const avatarButton = page.locator('button[title="Click to view/crop photo"]').first();
    await expect(avatarButton).toBeVisible();
    await avatarButton.click();

    // Verify CamperPhotoCropperModal opens with preview & crop options
    await expect(page.getByText("Camper Photo Preview")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Crop Photo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload New" })).toBeVisible();

    // Toggle to Crop mode
    const cropBtn = page.getByRole("button", { name: "Crop Photo" });
    await expect(cropBtn).toBeVisible({ timeout: 10000 });
    await cropBtn.click({ force: true });
    await expect(page.getByText("Crop & Reposition Photo")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Save Cropped Photo" })).toBeVisible();
  });
});
