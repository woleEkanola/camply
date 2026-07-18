import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Admin: Camper edit (campus reassignment) and delete", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campusAId: string;
  let campusBId: string;
  let parentId: string | undefined;
  let camperId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusAId = ctx.campusId;

    const campusB = await prisma.campus.create({
      data: {
        name: `E2E Reassign Campus ${Date.now()}`,
        slug: `e2e-reassign-campus-${Date.now()}`,
        address: "99 E2E Reassign Rd",
        city: "Testville",
        country: "Testland",
        organizationId,
      },
    });
    campusBId = campusB.id;

    const parentEmail = `e2e-camper-mgmt-parent-${Date.now()}@camply.test`;
    const parent = await prisma.user.create({ data: { email: parentEmail, password: "x", role: "PARENT", organizationId } });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: { name: `E2E Reassign Camper ${Date.now()}`, userId: parent.id, organizationId, homeCampusId: campusAId },
    });
    camperId = camper.id;
  });

  test.afterAll(async () => {
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    if (parentId) await prisma.user.deleteMany({ where: { id: parentId } });
    if (campusBId) await prisma.campus.deleteMany({ where: { id: campusBId } });
  });

  test("admin can edit a camper and reassign their home campus", async ({ page }) => {
    if (!camperId) throw new Error("camperId not set");

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    const camper = await prisma.camper.findUniqueOrThrow({ where: { id: camperId } });
    const row = page.locator("tr", { hasText: camper.name });
    await row.getByRole("button", { name: "Edit" }).click();

    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("heading", { name: "Edit Camper" })).toBeVisible();
    // First <select> in the modal is Home Campus (no Parent select shown when editing).
    await modal.locator("select").first().selectOption(campusBId);
    await modal.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Camper profile updated successfully")).toBeVisible({ timeout: 10000 });

    await expect
      .poll(async () => (await prisma.camper.findUniqueOrThrow({ where: { id: camperId! } })).homeCampusId)
      .toBe(campusBId);
  });

  test("admin can delete a camper profile", async ({ page }) => {
    if (!camperId) throw new Error("camperId not set");

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    const camper = await prisma.camper.findUniqueOrThrow({ where: { id: camperId } });
    const row = page.locator("tr", { hasText: camper.name });
    await row.getByRole("button", { name: "Delete" }).click();

    await page.getByRole("dialog").getByRole("button", { name: "Delete Profile" }).click();

    await expect(page.getByText("Camper profile deleted successfully")).toBeVisible({ timeout: 10000 });

    // Soft delete: recoverable from Trash for 60 days, not actually gone from the DB.
    await expect
      .poll(async () => (await prisma.camper.findUniqueOrThrow({ where: { id: camperId! } })).deletedAt)
      .not.toBeNull();
  });
});
