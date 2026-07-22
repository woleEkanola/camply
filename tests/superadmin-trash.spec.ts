import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Super Admin: Trash Can & User Account Restore/Purge", () => {
  test.describe.configure({ mode: "serial" });

  let targetUserId: string | undefined;
  const testUserEmail = `superadmin-trash-test-${Date.now()}@camply.test`;

  test.beforeAll(async () => {
    const { organizationId } = await getFixtureOrgContext();
    const hashedPassword = await bcrypt.hash("password123", 10);
    const user = await prisma.user.create({
      data: {
        email: testUserEmail,
        firstName: "Trash",
        lastName: "TestUser",
        password: hashedPassword,
        role: "PARENT",
        organizationId,
      },
    });
    targetUserId = user.id;
  });

  test.afterAll(async () => {
    if (targetUserId) {
      await prisma.user.deleteMany({ where: { id: targetUserId } });
    }
  });

  test("super admin soft-deletes a user, manages it in Trash Can tab, and restores account", async ({ page }) => {
    // 1. Log in as Super Admin
    await loginWithPassword(page, "superadmin@camply.com", "password123");
    await page.goto("/super-admin");

    // 2. Go to User Directory tab
    await page.getByRole("button", { name: "User Directory" }).click();

    // Fill search to filter directly to test user
    await page.getByPlaceholder("Search by name or email...").fill(testUserEmail);

    // 3. Find target user row and soft-delete
    const userRow = page.locator("tr", { hasText: testUserEmail });
    await expect(userRow).toBeVisible({ timeout: 10000 });

    await userRow.getByTitle("Delete User").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete User" }).click();

    await expect(page.getByText(/User soft-deleted successfully/i)).toBeVisible({ timeout: 10000 });

    // Verify DB soft-delete state
    await expect
      .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: targetUserId! } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();

    // 4. Switch to Trash Can tab
    await page.getByRole("button", { name: /Trash Can/i }).click();

    // Fill search to filter directly to test user in trash
    await page.getByPlaceholder("Search by label or type...").fill(testUserEmail);

    // 5. Verify soft-deleted user appears in Trash table
    const trashRow = page.locator("tr", { hasText: testUserEmail });
    await expect(trashRow).toBeVisible({ timeout: 10000 });

    // 6. Click Restore
    await trashRow.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restore Item" }).click();

    await expect(page.getByText("Item restored successfully")).toBeVisible({ timeout: 10000 });

    // Verify DB restored state
    await expect
      .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: targetUserId! } })).deletedAt, { timeout: 10000 })
      .toBeNull();
  });

  test("super admin can permanently delete (purge) an item from Trash Can tab", async ({ page }) => {
    if (!targetUserId) throw new Error("targetUserId not set");

    // Soft-delete the user in DB again to prepare for purge test
    await prisma.user.update({ where: { id: targetUserId }, data: { deletedAt: new Date() } });

    await loginWithPassword(page, "superadmin@camply.com", "password123");
    await page.goto("/super-admin");

    // Navigate to Trash Can tab
    await page.getByRole("button", { name: /Trash Can/i }).click();

    // Fill search to filter directly to test user in trash
    await page.getByPlaceholder("Search by label or type...").fill(testUserEmail);

    const trashRow = page.locator("tr", { hasText: testUserEmail });
    await expect(trashRow).toBeVisible({ timeout: 10000 });

    // Click Delete Forever
    await trashRow.getByRole("button", { name: "Delete Forever" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("input[type=text]").fill("delete");
    await dialog.getByRole("button", { name: "Delete Forever" }).click();

    await expect(page.getByText("Item permanently deleted")).toBeVisible({ timeout: 10000 });

    // Verify DB hard-delete state
    await expect(prisma.user.findUnique({ where: { id: targetUserId } })).resolves.toBeNull();
    targetUserId = undefined;
  });
});
