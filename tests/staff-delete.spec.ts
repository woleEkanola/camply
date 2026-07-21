import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Admin: Staff profile delete (Teachers page)", () => {
  test.describe.configure({ mode: "serial" });

  let staffProfileId: string | undefined;
  let staffUserId: string | undefined;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    const email = `e2e-staff-delete-${Date.now()}@camply.test`;
    const user = await prisma.user.create({ data: { email, password: "x", role: "TEACHER", organizationId } });
    staffUserId = user.id;
    const staff = await prisma.staffProfile.create({
      data: {
        userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: "E2E", lastName: "DeleteTeacher", phone: "+1-555-0700", email, approvedAt: new Date(),
      },
    });
    staffProfileId = staff.id;
  });

  test.afterAll(async () => {
    if (staffProfileId) await prisma.staffProfile.deleteMany({ where: { id: staffProfileId } });
    if (staffUserId) await prisma.user.deleteMany({ where: { id: staffUserId } });
  });

  test("admin can delete a teacher profile from the Teachers page", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");

    await page.getByRole("button", { name: "List", exact: true }).click();
    const row = page.locator("tr", { hasText: "E2E DeleteTeacher" });
    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect
      .poll(async () => (await prisma.staffProfile.findUniqueOrThrow({ where: { id: staffProfileId! } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();

    await expect(row).not.toBeVisible();
  });
});
