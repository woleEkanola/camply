import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Admin: bulk camper actions", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-bulk-camper-parent-${Date.now()}@camply.test`;
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let registrationId: string;
  let userId: string;
  let camperId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Bulk Camper Campus ${Date.now()}`,
        slug: `e2e-bulk-camper-campus-${Date.now()}`,
        address: "2 Bulk Ave",
        city: "Testville",
        country: "Testland",
        organizationId,
      },
    });
    campusId = campus.id;

    const parent = await prisma.user.create({
      data: {
        email: parentEmail,
        password: "unused",
        role: "PARENT",
        organizationId,
      },
    });
    userId = parent.id;

    const camper = await prisma.camper.create({
      data: {
        name: "E2E Bulk Camper",
        userId: parent.id,
        organizationId,
        homeCampusId: campus.id,
      },
    });
    camperId = camper.id;

    const registration = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId: campus.id,
        status: "PENDING",
      },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  test("admin can bulk-approve active registrations for selected campers", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    const row = page.locator("tbody tr").filter({ hasText: "E2E Bulk Camper" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('input[type="checkbox"]').first().click();

    await page.getByRole("button", { name: "Approve Reg", exact: true }).click();

    await expect.poll(async () => {
      const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
      return reg?.status;
    }, { timeout: 10000 }).toBe("APPROVED");
  });

  test("admin can bulk-delete selected campers", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    const row = page.locator("tbody tr").filter({ hasText: "E2E Bulk Camper" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('input[type="checkbox"]').first().click();

    await page.getByTestId("bulk-delete-button").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect.poll(async () => {
      const camper = await prisma.camper.findUnique({ where: { id: camperId } });
      return camper?.deletedAt !== null;
    }, { timeout: 10000 }).toBe(true);
  });
});
