import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, showAllRows, onlyVisible } from "./helpers";

test.describe("Teachers page: Campus column, filters, venue assignment", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let campusName: string;

  let teacherUserId: string | undefined;
  let teacherProfileId: string | undefined;
  let pendingUserId: string | undefined;
  let pendingProfileId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;
    campusName = ctx.campusName;

    const teacherUser = await prisma.user.create({
      data: { email: `e2e-staffcol-teacher-${Date.now()}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    teacherUserId = teacherUser.id;
    const teacher = await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E",
        lastName: "FilterTeacher",
        gender: "MALE",
        phone: "+1-555-0300",
        email: teacherUser.email,
        preferredCampusId: campusId,
      },
    });
    teacherProfileId = teacher.id;

    // A separate PENDING teacher, unassigned to any venue, to verify sole-venue auto-assign on approval.
    const pendingUser = await prisma.user.create({
      data: { email: `e2e-staffcol-pending-${Date.now()}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    pendingUserId = pendingUser.id;
    const pending = await prisma.staffProfile.create({
      data: {
        userId: pendingUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "PENDING",
        firstName: "E2E",
        lastName: "SoleVenueTeacher",
        gender: "FEMALE",
        phone: "+1-555-0301",
        email: pendingUser.email,
      },
    });
    pendingProfileId = pending.id;
  });

  test.afterAll(async () => {
    if (teacherProfileId) await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    if (teacherUserId) await prisma.user.deleteMany({ where: { id: teacherUserId } });
    if (pendingProfileId) await prisma.staffProfile.deleteMany({ where: { id: pendingProfileId } });
    if (pendingUserId) await prisma.user.deleteMany({ where: { id: pendingUserId } });
  });

  test("Campus column renders and the Campus filter narrows the list", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");
    await showAllRows(page);

    const row = page.locator("tr", { hasText: "FilterTeacher" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText(campusName);

    // Filter by this teacher's campus to confirm the column filter narrows the list.
    await onlyVisible(page.getByLabel("Filter by Campus")).selectOption({ label: campusName });
    await expect(page.locator("tr", { hasText: "FilterTeacher" })).toBeVisible({ timeout: 10000 });
  });

  test("bulk 'Assign to Venue' sets assignedVenueId for selected teachers", async ({ page }) => {
    // A dedicated, uniquely-named venue keeps the dropdown unambiguous
    // regardless of what other specs have left behind in this shared dev DB.
    // Deleted at the end of this test so the next test's "exactly one venue"
    // precondition still holds.
    const bulkVenue = await prisma.venue.create({ data: { campId, name: `E2E Bulk Assign Venue ${Date.now()}` } });

    try {
      await loginWithPassword(page, "owner@camply.com", "password123");
      await page.goto("/admin/teachers");
      await showAllRows(page);

      const row = page.locator("tr", { hasText: "FilterTeacher" });
      await expect(row).toBeVisible({ timeout: 10000 });
      await row.locator('input[type="checkbox"]').click();

      await expect(page.getByText("1 selected")).toBeVisible();
      await page.locator("select", { hasText: "Assign to venue…" }).selectOption({ label: bulkVenue.name });
      await page.getByRole("button", { name: "Assign", exact: true }).click();

      await expect
        .poll(async () => (await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacherProfileId! } })).assignedVenueId, { timeout: 10000 })
        .toBe(bulkVenue.id);
    } finally {
      await prisma.staffProfile.updateMany({ where: { id: teacherProfileId! }, data: { assignedVenueId: null } });
      await prisma.venue.deleteMany({ where: { id: bulkVenue.id } });
    }
  });

  test("approving a teacher in a single-venue camp auto-assigns the sole venue", async ({ page }) => {
    const venues = await prisma.venue.findMany({ where: { campId, deletedAt: null } });
    test.skip(venues.length !== 1, "This fixture camp doesn't have exactly one venue right now.");
    const soleVenueId = venues[0].id;

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");
    await showAllRows(page);

    const row = page.locator("tr", { hasText: "SoleVenueTeacher" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('input[type="checkbox"]').click();
    // Scoped to the bulk-actions toolbar — the row itself also has an inline
    // "Approve" action now, so an unscoped query is ambiguous once selected.
    await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Approve", exact: true }).click();

    await expect
      .poll(async () => (await prisma.staffProfile.findUniqueOrThrow({ where: { id: pendingProfileId! } })).assignedVenueId, { timeout: 10000 })
      .toBe(soleVenueId);
  });
});
