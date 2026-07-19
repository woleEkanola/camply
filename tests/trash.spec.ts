import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, visibleText } from "./helpers";

test.describe("Admin: Trash (restore / permanent delete)", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campusId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Trash Campus ${Date.now()}`,
        slug: `e2e-trash-campus-${Date.now()}`,
        address: "1 E2E Trash Way",
        city: "Testville",
        country: "Testland",
        organizationId,
        deletedAt: new Date(),
      },
    });
    campusId = campus.id;
  });

  test.afterAll(async () => {
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  test("a soft-deleted item appears in Trash and can be restored", async ({ page }) => {
    if (!campusId) throw new Error("campusId not set");
    const campus = await prisma.campus.findUniqueOrThrow({ where: { id: campusId } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/trash");

    await expect(visibleText(page, campus.name)).toBeVisible({ timeout: 10000 });

    const row = page.locator("tr", { hasText: campus.name });
    await row.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restore", exact: true }).click();

    await expect(page.getByText("Item restored successfully")).toBeVisible({ timeout: 10000 });
    await expect(visibleText(page, campus.name)).not.toBeVisible();

    await expect
      .poll(async () => (await prisma.campus.findUniqueOrThrow({ where: { id: campusId! } })).deletedAt)
      .toBeNull();
  });

  test("an item can be permanently deleted from Trash", async ({ page }) => {
    if (!campusId) throw new Error("campusId not set");

    // Re-soft-delete it so there's something to purge.
    await prisma.campus.update({ where: { id: campusId }, data: { deletedAt: new Date() } });
    const campus = await prisma.campus.findUniqueOrThrow({ where: { id: campusId } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/trash");

    await expect(visibleText(page, campus.name)).toBeVisible({ timeout: 10000 });

    const row = page.locator("tr", { hasText: campus.name });
    await row.getByRole("button", { name: "Delete Forever" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("input[type=text]").fill("delete");
    await dialog.getByRole("button", { name: "Delete Forever" }).click();

    await expect(page.getByText("Item permanently deleted")).toBeVisible({ timeout: 10000 });

    await expect(prisma.campus.findUnique({ where: { id: campusId } })).resolves.toBeNull();
    campusId = undefined;
  });
});
