import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail } from "./helpers";

/**
 * Implements the previously-dormant STAFF ExportKind (declared in types.ts
 * but never registered) plus a new STAFF_ID_CARDS kind, following the same
 * dialog -> background job -> Export Center -> download flow campers use.
 */
test.describe("Staff export: data spreadsheet and ID card sheet", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const teacherEmail = `e2e-staffexport-teacher-${stamp}@camply.test`;
  const teacherName = `E2E Export Teacher ${stamp}`;

  let organizationId: string;
  let campId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const user = await prisma.user.create({
      data: { email: teacherEmail, password: "unused", role: "TEACHER", organizationId },
    });
    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: teacherName,
        lastName: "Staffer",
        phone: "+1-555-0800",
        email: teacherEmail,
        approvedAt: new Date(),
      },
    });
  });

  test.afterAll(async () => {
    await prisma.exportJob.deleteMany({ where: { organizationId, kind: { in: ["STAFF", "STAFF_ID_CARDS"] } } });
    await deleteStaffByEmail(teacherEmail);
  });

  test("admin can export the teacher list as an XLSX and the job completes", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");
    await expect(page.getByText(teacherName).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Open Downloads" }).click();
    await expect(page.getByText(/camply-staff-.*\.xlsx/).first()).toBeVisible({ timeout: 20000 });

    const job = await prisma.exportJob.findFirstOrThrow({
      where: { organizationId, kind: "STAFF" },
      orderBy: { createdAt: "desc" },
    });
    expect(job.status).toBe("DONE");
    expect(job.fileSize).toBeGreaterThan(0);
  });

  test("admin can generate a Staff ID Cards PDF sheet", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");
    await expect(page.getByText(teacherName).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "ID Cards" }).click();
    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        async () => {
          const job = await prisma.exportJob.findFirst({
            where: { organizationId, kind: "STAFF_ID_CARDS" },
            orderBy: { createdAt: "desc" },
          });
          return job?.status;
        },
        { timeout: 20000 }
      )
      .toBe("DONE");
  });
});
