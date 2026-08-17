import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Two fixes bundled in one spec:
 * 1. The "Users" link was dropped from the admin sidebar's Settings group
 *    during an unrelated nav restructure (commit 8d83836) — /admin/users
 *    and its "Correct email" feature kept working, they just became
 *    unreachable from the sidebar. Covers the link is back and navigates.
 * 2. The Accounts page's "Parents & Teens" tab had no search — added a
 *    SearchBar in ParentProfilesAccordion.tsx that matches parent name,
 *    parent email, or any linked teen/camper name (server query extended
 *    to return camper names, not just counts, for this).
 */
test.describe("Admin Users: sidebar nav link + Parents & Teens search", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  const parentEmail = `e2e-userssearch-parent-${stamp}@camply.test`;
  const camperName = `E2E SearchTeen ${stamp}`;
  const otherParentEmail = `e2e-userssearch-other-${stamp}@camply.test`;
  const otherCamperName = `E2E OtherTeen ${stamp}`;

  let organizationId: string;
  let campusId: string;
  let parentUserId: string;
  let otherParentUserId: string;
  let camperId: string;
  let otherCamperId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusId = ctx.campusId;

    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId, firstName: "SearchParent", lastName: stamp.toString() },
    });
    parentUserId = parent.id;
    const camper = await prisma.camper.create({
      data: { name: camperName, userId: parent.id, organizationId, homeCampusId: campusId, gender: "Male" },
    });
    camperId = camper.id;

    const otherParent = await prisma.user.create({
      data: { email: otherParentEmail, password: "x", role: "PARENT", organizationId, firstName: "Unrelated", lastName: "Guardian" },
    });
    otherParentUserId = otherParent.id;
    const otherCamper = await prisma.camper.create({
      data: { name: otherCamperName, userId: otherParent.id, organizationId, homeCampusId: campusId, gender: "Female" },
    });
    otherCamperId = otherCamper.id;
  });

  test.afterAll(async () => {
    await prisma.camper.deleteMany({ where: { id: { in: [camperId, otherCamperId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [parentUserId, otherParentUserId] } } });
  });

  test("the Users link is visible in the admin sidebar Settings group and navigates to /admin/users", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin");

    // Settings is a collapsible group, closed by default.
    await page.locator("nav").getByRole("button", { name: "Settings" }).click();
    const usersLink = page.locator("nav").getByRole("link", { name: "Users", exact: true });
    await expect(usersLink).toBeVisible({ timeout: 10000 });
    await usersLink.click();
    await page.waitForURL(/\/admin\/users/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  });

  test("Parents & Teens search filters by parent name/email and by teen name", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/users");
    await page.getByRole("tab", { name: "Parents & Teens" }).click();

    const search = page.getByRole("textbox", { name: /Search parent and teen accounts/i });
    await expect(search).toBeVisible({ timeout: 15000 });

    // Sanity: both rows present before searching.
    await expect(page.getByRole("row").filter({ hasText: parentEmail })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: otherParentEmail })).toBeVisible();

    // Search by parent email.
    await search.fill(parentEmail);
    await expect(page.getByRole("row").filter({ hasText: parentEmail })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: otherParentEmail })).toHaveCount(0);

    // Search by teen/camper name — matches the parent row even though the
    // camper name itself isn't a column, since matching is name-aware.
    await search.fill(otherCamperName);
    await expect(page.getByRole("row").filter({ hasText: otherParentEmail })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: parentEmail })).toHaveCount(0);

    // No matches.
    await search.fill(`nonexistent-${stamp}`);
    await expect(page.getByText("No accounts match your search.")).toBeVisible();

    // Clear restores the full list.
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByRole("row").filter({ hasText: parentEmail })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: otherParentEmail })).toBeVisible();
  });
});
