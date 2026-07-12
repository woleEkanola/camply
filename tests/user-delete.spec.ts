import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword, emailInput, nextButton, passwordInput, loginButton } from "./helpers";

test.describe("Admin: User soft-delete blocks login and lands in Trash", () => {
  test.describe.configure({ mode: "serial" });

  let repUserId: string | undefined;
  const repEmail = `e2e-user-delete-rep-${Date.now()}@camply.test`;

  test.beforeAll(async () => {
    const { organizationId } = await getFixtureOrgContext();
    const hashedPassword = await bcrypt.hash("password123", 10);
    const rep = await prisma.user.create({
      data: { email: repEmail, password: hashedPassword, role: "CAMPUS_REPRESENTATIVE", organizationId },
    });
    repUserId = rep.id;
  });

  test.afterAll(async () => {
    if (repUserId) await prisma.user.deleteMany({ where: { id: repUserId } });
  });

  test("deleting a user soft-deletes them, blocks further login, and lists them in Trash", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/users");

    const row = page.locator("tr", { hasText: repEmail });
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect
      .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: repUserId! } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();

    // A soft-deleted user must not be able to log in anymore, even with the correct password.
    await page.goto("/login");
    await page.locator('button:visible', { hasText: "Password" }).first().click();
    await emailInput(page).fill(repEmail);
    await passwordInput(page).fill("password123");
    await loginButton(page).click();

    await expect(
      page.locator("div.bg-red-100:visible", { hasText: /invalid|incorrect|failed/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveURL(/\/(admin|campus-rep-dashboard)/);

    // Deleted user shows up in Trash for the org admin.
    await page.goto("/admin/trash");
    await expect(page.getByText(repEmail)).toBeVisible({ timeout: 10000 });
  });
});
