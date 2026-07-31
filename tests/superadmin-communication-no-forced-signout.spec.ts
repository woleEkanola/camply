import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * Covers the reported bug: src/app/providers.tsx force-signed-out on ANY
 * query/mutation error whose code was 'UNAUTHORIZED', regardless of
 * message. communication.ts's orgId(ctx) helper throws exactly that code
 * with message "No organization" whenever the caller has no
 * organizationId — which is the SUPER_ADMIN role's normal state
 * (User.organizationId is nullable; SUPER_ADMINs sit outside any single
 * org by design). A super-admin opening any communication page was
 * therefore instantly logged out. The fix narrows the client-side handler
 * to match on the specific "Not authenticated" / "User not found" messages
 * that actually mean the session itself is stale, not just any
 * business-logic UNAUTHORIZED throw.
 */
test.describe("Super-admin opening a communication page is not force-signed-out", () => {
  test("dashboard loads (or shows an in-page error) without redirecting to /login", async ({ page }) => {
    await loginWithPassword(page, "superadmin@camply.com", "password123");

    await page.goto("/admin/communication/dashboard");

    // Give any UNAUTHORIZED-triggered signOut() a moment to redirect if the
    // bug were still present — signOut() navigates to /login.
    await page.waitForTimeout(2000);

    expect(page.url()).not.toContain("/login");
    // Session survives: some other authenticated-only chrome renders, most
    // reliably the top-level app shell rather than the login form.
    await expect(page.locator('input[type="email"]')).not.toBeVisible();
  });

  test("templates page loads without redirecting to /login", async ({ page }) => {
    await loginWithPassword(page, "superadmin@camply.com", "password123");

    await page.goto("/admin/communication/templates");
    await page.waitForTimeout(2000);

    expect(page.url()).not.toContain("/login");
    await expect(page.locator('input[type="email"]')).not.toBeVisible();
  });
});
