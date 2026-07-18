import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail, fieldByLabel, visibleText } from "./helpers";

test.describe("Admin: staff approval and assignment", () => {
  test.describe.configure({ mode: "serial" });

  const email = `e2e-approve-${Date.now()}@camply.test`;
  let departmentId: string;
  let venueId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    const user = await prisma.user.create({
      data: { email, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "PENDING",
        firstName: "Approve",
        lastName: "TargetE2E",
        phone: "+1-555-0300",
        email,
      },
    });

    // A department fixture — this org has no seeded departments by default,
    // and department assignment is worth covering independently of whatever
    // an admin happened to create by hand.
    const existingDept = await prisma.department.findFirst({
      where: { organizationId, campId, name: "E2E Test Department", deletedAt: null },
    });
    const dept = existingDept ?? (await prisma.department.create({ data: { organizationId, campId, name: "E2E Test Department" } }));
    departmentId = dept.id;

    // A venue fixture — the Assignment tab's "Centre" field assigns a Venue
    // (operational, post-approval), not a Campus.
    const venue = await prisma.venue.create({ data: { campId, name: `E2E Assignment Venue ${Date.now()}` } });
    venueId = venue.id;
  });

  test.afterAll(async () => {
    await deleteStaffByEmail(email);
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
  });

  test("owner can approve a pending teacher, assign a centre and department, and mark them Department Head", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");

    // Scope by the unique email, not the static display name — "Approve
    // TargetE2E" isn't timestamp-suffixed like the email is, so a leftover
    // row from an earlier interrupted run (afterAll never ran, e.g. a killed
    // process) collides with this run's fixture and trips a strict-mode
    // "resolved to 2 elements" violation.
    await page.locator("tr", { hasText: email }).click();
    // The list table behind the drawer can also contain APPROVED rows from
    // other fixtures/orgs data, so scope status assertions to the drawer.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("PENDING", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(dialog.getByText("APPROVED", { exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByRole("tab", { name: "Assignment" }).click();
    await fieldByLabel(page, "Venue").selectOption({ label: venue.name });
    await fieldByLabel(page, "Department").selectOption({ label: "E2E Test Department" });
    await page.getByText("Department Head", { exact: true }).click();

    await expect
      .poll(
        async () => {
          const updated = await prisma.staffProfile.findFirst({ where: { email } });
          return {
            assignedVenueId: updated?.assignedVenueId,
            departmentId: updated?.departmentId,
            isDepartmentHead: updated?.isDepartmentHead,
          };
        },
        { timeout: 10000 }
      )
      .toEqual({ assignedVenueId: venueId, departmentId, isDepartmentHead: true });
  });

  test("owner can reject a pending volunteer with a reason", async ({ page }) => {
    const rejectEmail = `e2e-reject-${Date.now()}@camply.test`;
    const { organizationId, campId } = await getFixtureOrgContext();
    const user = await prisma.user.create({
      data: { email: rejectEmail, password: "placeholder-not-used-for-login", role: "VOLUNTEER", organizationId },
    });
    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId,
        campId,
        type: "VOLUNTEER",
        status: "PENDING",
        firstName: "Reject",
        lastName: "TargetE2E",
        phone: "+1-555-0400",
        email: rejectEmail,
      },
    });

    try {
      await loginWithPassword(page, "owner@camply.com", "password123");
      await page.goto("/admin/volunteers");

      await visibleText(page, "Reject TargetE2E").click();
      const dialog = page.getByRole("dialog");
      await dialog.getByPlaceholder("Rejection reason").fill("E2E test rejection");
      await dialog.getByRole("button", { name: "Reject", exact: true }).click();

      await expect(dialog.getByText("REJECTED", { exact: true })).toBeVisible({ timeout: 10000 });

      const updated = await prisma.staffProfile.findFirst({ where: { email: rejectEmail } });
      expect(updated?.status).toBe("REJECTED");
      expect(updated?.rejectionReason).toBe("E2E test rejection");
    } finally {
      await deleteStaffByEmail(rejectEmail);
    }
  });
});
