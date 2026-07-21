import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, switchRegistrationsToListView } from "./helpers";

test.describe("Admin: bulk registration actions", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-bulk-reg-parent-${Date.now()}@camply.test`;
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
        name: `E2E Bulk Reg Campus ${Date.now()}`,
        slug: `e2e-bulk-reg-campus-${Date.now()}`,
        address: "1 Bulk Ave",
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
        name: "E2E Bulk Reg Camper",
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

  test("admin can bulk-approve selected registrations", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.getByTestId("registration-status-filter").selectOption("PENDING");
    const row = page.locator("tbody tr").filter({ hasText: "E2E Bulk Reg Camper" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('input[type="checkbox"]').first().click();

    await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Approve", exact: true }).click();

    await expect.poll(async () => {
      const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
      return reg?.status;
    }, { timeout: 10000 }).toBe("APPROVED");

    await expect(page.getByText(/Bulk action complete:/)).toBeVisible();
  });

  test("admin can bulk-archive selected registrations", async ({ page }) => {
    await prisma.registration.update({ where: { id: registrationId }, data: { status: "APPROVED" } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.getByTestId("registration-status-filter").selectOption("APPROVED");
    const row = page.locator("tbody tr").filter({ hasText: "E2E Bulk Reg Camper" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('input[type="checkbox"]').first().click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Archive", exact: true }).click();

    await expect.poll(async () => {
      const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
      return reg?.status;
    }, { timeout: 10000 }).toBe("ARCHIVED");
  });

  test("archived registrations are visible via the Archived filter", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.getByRole("button", { name: "Archived" }).click();
    await expect(page.locator("tr", { hasText: "E2E Bulk Reg Camper" })).toBeVisible({ timeout: 10000 });
  });
});
