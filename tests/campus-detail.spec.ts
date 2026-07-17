import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, showAllRows } from "./helpers";

test.describe("Admin: Campus detail and rep display", () => {
  test.describe.configure({ mode: "serial" });

  const campusName = `E2E Campus Detail ${Date.now()}`;
  let campusId: string | undefined;
  let organizationId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    // Create a campus with an assigned rep that has no first/last name so we
    // can verify the email fallback (instead of raw ID).
    const repUser = await prisma.user.create({
      data: {
        email: `e2e-campus-rep-${Date.now()}@camply.test`,
        password: "unused",
        role: "CAMPUS_REPRESENTATIVE",
        organizationId,
      },
    });

    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        slug: `e2e-campus-detail-${Date.now()}`,
        address: "42 Detail Ave",
        city: "Testville",
        country: "Testland",
        organizationId,
        reps: { connect: { id: repUser.id } },
      },
    });
    campusId = campus.id;
  });

  test.afterAll(async () => {
    if (campusId) {
      await prisma.campus.update({ where: { id: campusId }, data: { reps: { set: [] } } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
    await prisma.user.deleteMany({ where: { email: { contains: "e2e-campus-rep-" } } });
  });

  test("campus row shows rep email fallback and opens detail drawer with stats", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");

    await showAllRows(page);
    const row = page.locator("tr", { hasText: campusName });
    await expect(row).toContainText("42 Detail Ave");

    // Rep has no name, so the cell should show the email, not the raw user ID.
    const repUser = await prisma.user.findFirst({
      where: { email: { contains: "e2e-campus-rep-" } },
      orderBy: { createdAt: "desc" },
    });
    await expect(row.getByText(repUser?.email ?? "")).toBeVisible();
    await expect(row).not.toContainText(repUser?.id ?? "should-not-match");

    // Open detail drawer.
    await row.click();
    await expect(page.getByRole("heading", { name: campusName })).toBeVisible();
    await expect(page.getByText("Assigned Representatives")).toBeVisible();
    await expect(page.getByRole("dialog").getByText(repUser?.email ?? "")).toBeVisible();

    // Stats sections render.
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "Registrations" })).toBeVisible();
    await expect(drawer.getByText("Total Campers")).toBeVisible();
    await expect(drawer.getByText("Total Registrations")).toBeVisible();
  });
});
