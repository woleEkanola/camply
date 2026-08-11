import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";
import { hashPassword } from "../src/lib/auth";

test.describe("Admin correct email address", () => {
  test("an admin safely changes a parent email and the parent's old session is signed out", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const { organizationId } = await getFixtureOrgContext();
    const stamp = Date.now();
    const oldEmail = `email-correction-old-${stamp}@camply.test`;
    const newEmail = `email-correction-new-${stamp}@camply.test`;
    const password = "testpass123";
    const passwordHash = await hashPassword(password);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@camply.com" } });
    const parent = await prisma.user.create({
      data: { email: oldEmail, password: passwordHash, passwordSet: true, role: "PARENT", organizationId, firstName: "Email", lastName: "Parent" },
    });
    await prisma.oTP.create({
      data: { email: oldEmail, purpose: "LOGIN", code: "123456", expiresAt: new Date(Date.now() + 60_000) },
    });

    const parentContext = await browser.newContext();
    const parentPage = await parentContext.newPage();
    try {
      await loginWithPassword(parentPage, oldEmail, password);
      await expect(parentPage).toHaveURL(/\/dashboard/, { timeout: 15_000 });

      await loginWithPassword(page, "owner@camply.com", "password123");
      await page.goto("/admin/users");
      await page.getByRole("tab", { name: "Parents & Teens" }).click();

      const parentRow = page.getByRole("row").filter({ hasText: oldEmail });
      await expect(parentRow).toBeVisible();
      await parentRow.getByRole("button", { name: "Correct email" }).click();
      await expect(page.locator('[data-testid="correct-email-form"]:visible')).toBeVisible();
      await page.locator('[data-testid="new-email"]:visible').fill(`  ${newEmail.toUpperCase()}  `);
      await page.locator('[data-testid="confirm-new-email"]:visible').fill(newEmail);
      await page.locator('[data-testid="email-correction-reason"]:visible').fill("Parent entered a typo during registration");
      await page.locator('[data-testid="submit-email-correction"]:visible').click();

      await expect(page.getByText(new RegExp(`Email changed to ${newEmail}`, "i"))).toBeVisible({ timeout: 15_000 });
      await expect(parentRow).not.toBeVisible();
      await expect(page.getByRole("row").filter({ hasText: newEmail })).toBeVisible();

      expect(await prisma.user.findUnique({ where: { id: parent.id } })).toMatchObject({ email: newEmail });
      expect(await prisma.oTP.count({ where: { email: oldEmail } })).toBe(0);
      expect(await prisma.auditLog.findFirst({ where: { subjectId: parent.id, action: "USER_EMAIL_CORRECTED" } })).toMatchObject({
        actorId: owner.id,
        reason: "Parent entered a typo during registration",
      });

      await parentPage.goto("/dashboard");
      await expect(parentPage).toHaveURL(/\/login\?reason=email-changed/, { timeout: 15_000 });
      await expect(
        parentPage.locator('[role="status"]:visible').filter({ hasText: /email address was changed by an administrator/i }).first()
      ).toBeVisible();

      await loginWithPassword(parentPage, newEmail, password);
      await expect(parentPage).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    } finally {
      await parentContext.close().catch(() => undefined);
      await prisma.notification.deleteMany({ where: { userId: parent.id } });
      await prisma.auditLog.deleteMany({ where: { subjectId: parent.id } });
      await prisma.oTP.deleteMany({ where: { email: { in: [oldEmail, newEmail] } } });
      await prisma.user.deleteMany({ where: { id: parent.id } });
    }
  });
});
