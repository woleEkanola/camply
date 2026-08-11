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
  let quotaOccupantCamperId: string | undefined;
  let quotaOccupantRegistrationId: string | undefined;
  let signupLinkId: string | undefined;

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
    await prisma.registration.deleteMany({ where: { id: { in: [registrationId, quotaOccupantRegistrationId].filter(Boolean) as string[] } } });
    if (signupLinkId) await prisma.signupLink.deleteMany({ where: { id: signupLinkId } });
    await prisma.camper.deleteMany({ where: { id: { in: [camperId, quotaOccupantCamperId].filter(Boolean) as string[] } } });
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

  test("admin can promote a waitlisted registration even while the campus quota is full", async ({ page }) => {
    const quotaOccupant = await prisma.camper.create({
      data: {
        name: "E2E Quota Occupant Camper",
        userId,
        organizationId,
        homeCampusId: campusId,
      },
    });
    quotaOccupantCamperId = quotaOccupant.id;
    const occupantRegistration = await prisma.registration.create({
      data: { camperId: quotaOccupant.id, campId, campusId, status: "APPROVED" },
    });
    quotaOccupantRegistrationId = occupantRegistration.id;
    const signupLink = await prisma.signupLink.create({
      data: {
        token: `e2e-bulk-waitlist-${Date.now()}`,
        campusId,
        campId,
        active: true,
        quota: 1,
        quotaFullBehavior: "WAITLIST",
      },
    });
    signupLinkId = signupLink.id;
    await prisma.registration.update({ where: { id: registrationId }, data: { status: "WAITLISTED" } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);
    await page.getByTestId("registration-status-filter").selectOption("WAITLISTED");

    const row = page.locator("tbody tr").filter({ hasText: "E2E Bulk Reg Camper" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('input[type="checkbox"]').first().click();
    await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Approve", exact: true }).click();

    await expect.poll(async () => {
      return (await prisma.registration.findUnique({ where: { id: registrationId } }))?.status;
    }, { timeout: 10000 }).toBe("APPROVED");
    await expect(page.getByText("Bulk action complete: 1 succeeded.")).toBeVisible();

    const audit = await prisma.auditLog.findFirst({
      where: { registrationId, action: "REGISTRATION_APPROVED" },
      orderBy: { createdAt: "desc" },
    });
    expect((audit?.newValue as { capacityOverride?: boolean } | null)?.capacityOverride).toBe(true);
  });

  test("admin can promote a waitlisted registration through Change Status", async ({ page }) => {
    await prisma.registration.update({ where: { id: registrationId }, data: { status: "WAITLISTED" } });

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);
    await page.getByTestId("registration-status-filter").selectOption("WAITLISTED");

    const row = page.locator("tbody tr").filter({ hasText: "E2E Bulk Reg Camper" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();
    await page.getByTestId("drawer-panel").getByLabel("More options").click();
    await page.getByTestId("drawer-panel").getByText("Change Status").click();
    await page.getByTestId("dialog-panel").getByRole("button", { name: "Approve Registration" }).click();

    await expect.poll(async () => {
      return (await prisma.registration.findUnique({ where: { id: registrationId } }))?.status;
    }, { timeout: 10000 }).toBe("APPROVED");
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
