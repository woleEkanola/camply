import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Admin: Campus CRUD and signup link generation", () => {
  test.describe.configure({ mode: "serial" });

  const campusName = `E2E Campus ${Date.now()}`;
  let campusId: string | undefined;

  test.afterAll(async () => {
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("owner can create a campus and generate a signup link for it", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");

    await page.getByRole("button", { name: "Add Campus" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Campus Name").fill(campusName);
    await dialog.getByLabel("Address").fill("42 E2E Test Ave");
    await dialog.getByLabel("City").fill("Testville");
    await dialog.getByLabel("Country").fill("Testland");
    await dialog.getByRole("button", { name: "Add Campus", exact: true }).click();

    await expect(page.getByText(campusName)).toBeVisible({ timeout: 10000 });

    const campus = await prisma.campus.findFirstOrThrow({ where: { name: campusName } });
    campusId = campus.id;
    expect(campus.address).toBe("42 E2E Test Ave");
    expect(campus.active).toBe(true);

    const row = page.locator("tr", { hasText: campusName });
    await row.getByRole("button", { name: /Generate Link/i }).click();

    await expect
      .poll(async () => prisma.signupLink.findFirst({ where: { campusId: campus.id } }), { timeout: 10000 })
      .not.toBeNull();

    const link = await prisma.signupLink.findFirstOrThrow({ where: { campusId: campus.id } });
    expect(link.active).toBe(true);
    expect(link.campId).toBeTruthy();
  });

  test("campus list is scoped to the caller's organization", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");

    await expect(page.getByText(campusName)).toBeVisible({ timeout: 10000 });

    const allCampusesForOrg = await prisma.campus.findMany({ where: { organizationId } });
    expect(allCampusesForOrg.some((c) => c.name === campusName)).toBe(true);
  });
});
