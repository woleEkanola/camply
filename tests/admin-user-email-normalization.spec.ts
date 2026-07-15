import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, fieldByLabel } from "./helpers";

// Regression coverage for the storage-side half of email normalization: lookups
// (login, OTP, etc.) normalize the email they query with, but a user CREATED
// with a mixed-case email must also have it stored lowercase — otherwise that
// account can never be found again by a normalized lookup. See src/lib/email.ts
// and its call sites in src/server/api/routers/{user,auth,staff,admin,owner}.ts.
test.describe("Admin-created user email is stored normalized", () => {
  test("mixed-case email is lowercased on create and the new account can log in", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    const stamp = Date.now();
    const mixedCaseEmail = `  E2E-Norm-${stamp}@CAMPLY.TEST  `;
    const lowercasedEmail = `e2e-norm-${stamp}@camply.test`;
    const password = "testpass123";

    try {
      await loginWithPassword(page, "owner@camply.com", "password123");
      await page.goto("/admin/users");

      await page.getByRole("button", { name: "Add Staff Member" }).first().click();
      await fieldByLabel(page, "Email Address").fill(mixedCaseEmail);
      await fieldByLabel(page, "First Name").fill("Norm");
      await fieldByLabel(page, "Last Name").fill("Test");
      await fieldByLabel(page, "Role").selectOption("CAMPUS_REPRESENTATIVE");
      await fieldByLabel(page, "Password").fill(password);
      await fieldByLabel(page, "Confirm Password").fill(password);
      await page.getByRole("button", { name: "Add User" }).click();

      await expect(page.getByText("User created successfully")).toBeVisible({ timeout: 10000 });

      // Stored row must be keyed on the normalized (trimmed, lowercased) email —
      // a lookup with the raw mixed-case/spaced string must NOT find it.
      const rawLookup = await prisma.user.findUnique({ where: { email: mixedCaseEmail } });
      expect(rawLookup).toBeNull();

      const stored = await prisma.user.findUnique({ where: { email: lowercasedEmail } });
      expect(stored).not.toBeNull();
      expect(stored?.email).toBe(lowercasedEmail);
      expect(stored?.organizationId).toBe(organizationId);

      // The account must be usable via the normal login flow.
      const otherPage = await page.context().browser()!.newContext().then((ctx) => ctx.newPage());
      try {
        await loginWithPassword(otherPage, lowercasedEmail, password);
        await expect(otherPage).toHaveURL(/\/(admin|campus-rep-dashboard)/, { timeout: 15000 });
      } finally {
        await otherPage.context().close();
      }
    } finally {
      await prisma.user.deleteMany({ where: { email: lowercasedEmail } });
    }
  });
});
