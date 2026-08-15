import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginWithPassword } from "./helpers";
import { seedTeenCampDepartments } from "../src/server/departments/jdSeed";

test.describe("Department reconciliation and bulk archive/delete", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
  const ownerEmail = `e2e-dept-recon-owner-${stamp}@camply.test`;
  let organizationId = "";
  let campId = "";

  test.beforeAll(async () => {
    const password = await bcrypt.hash("password123", 12);
    const organization = await prisma.organization.create({ data: { name: `E2E Dept Recon ${stamp}`, slug: `e2e-dept-recon-${stamp}` } });
    organizationId = organization.id;
    const camp = await prisma.camp.create({ data: { name: `E2E Dept Recon Camp ${stamp}`, slug: `e2e-dept-recon-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), active: true, status: "OPEN", organizationId } });
    campId = camp.id;
    await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
    const owner = await prisma.user.create({ data: { email: ownerEmail, password, role: "OWNER", firstName: "Recon", lastName: "Owner", organizationId } });

    // Install the 2026 JD ahead of time (already covered end-to-end via the
    // "Install 2026 JD" button in departments-operations.spec.ts) so this
    // spec can focus on reconciling a pre-existing stray department against it.
    await seedTeenCampDepartments(prisma, { organizationId, campId, actorId: owner.id });

    // A department that predates the JD install, named identically to one of
    // its roles so the merge also has to collapse the colliding position.
    const stray = await prisma.department.create({ data: { organizationId, campId, name: "Media Team", purpose: "Old media crew", status: "ACTIVE" } });
    const strayHead = await prisma.position.create({ data: { campId, departmentId: stray.id, name: "Media Lead", roleKind: "HEAD" } });
    const teacherUser = await prisma.user.create({ data: { email: `e2e-dept-recon-teacher-${stamp}@camply.test`, password, role: "TEACHER", firstName: "Stray", lastName: "Teacher", organizationId } });
    const teacherProfile = await prisma.staffProfile.create({ data: { userId: teacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Stray", lastName: "Teacher", phone: "08011112222", email: teacherUser.email, preferredDepartmentId: stray.id, departmentId: stray.id } });
    await prisma.positionAssignment.create({ data: { positionId: strayHead.id, staffId: teacherProfile.id, isCurrent: true, isPrimary: true } });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  test("shows a reconciliation banner and merges a stray department into its JD match", async ({ page }) => {
    await loginWithPassword(page, ownerEmail, "password123");
    await page.goto("/admin/departments");
    await expect(page.getByRole("heading", { name: "Departments" })).toBeVisible();

    await expect(page.getByText(/department isn't part of the 2026 JD|departments aren't part of the 2026 JD/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Review" }).click();

    const dialog = page.getByRole("dialog").filter({ hasText: "Reconcile departments with the 2026 JD" });
    await expect(dialog.getByText("Media Team")).toBeVisible();
    await expect(dialog.getByText("high match")).toBeVisible();
    await expect(dialog.getByText(/1 preferred it/)).toBeVisible();

    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Departments reconciled with the 2026 JD.")).toBeVisible({ timeout: 15_000 });

    const merged = await prisma.department.findFirstOrThrow({ where: { organizationId, campId, name: "Media Team" } });
    expect(merged.deletedAt).toBeTruthy();
    const target = await prisma.department.findFirstOrThrow({ where: { organizationId, campId, name: "Media" } });
    expect(merged.mergedIntoId).toBe(target.id);

    const survivingHead = await prisma.position.findFirstOrThrow({ where: { departmentId: target.id, name: "Media Lead" } });
    const currentHeads = await prisma.positionAssignment.count({ where: { positionId: survivingHead.id, isCurrent: true } });
    expect(currentHeads).toBe(1);
  });

  test("bulk-archives and bulk-deletes departments from the list view, reporting a blocked deletion", async ({ page }) => {
    const emptyA = await prisma.department.create({ data: { organizationId, campId, name: "Bulk Empty A", status: "ACTIVE" } });
    const emptyB = await prisma.department.create({ data: { organizationId, campId, name: "Bulk Empty B", status: "ACTIVE" } });
    const occupied = await prisma.department.create({ data: { organizationId, campId, name: "Bulk Occupied", status: "ACTIVE" } });
    const occupiedUser = await prisma.user.create({ data: { email: `e2e-dept-recon-occupied-${stamp}@camply.test`, password: await bcrypt.hash("password123", 12), role: "TEACHER", firstName: "Occupied", lastName: "Teacher", organizationId } });
    await prisma.staffProfile.create({ data: { userId: occupiedUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Occupied", lastName: "Teacher", phone: "08033334444", email: occupiedUser.email, departmentId: occupied.id } });

    await loginWithPassword(page, ownerEmail, "password123");
    await page.goto("/admin/departments");
    await expect(page.getByRole("heading", { name: "Departments" })).toBeVisible();
    await page.getByRole("button", { name: "List view" }).click();

    const rowA = page.getByRole("row", { name: /Bulk Empty A/ });
    const rowB = page.getByRole("row", { name: /Bulk Empty B/ });
    await expect(rowA).toBeVisible({ timeout: 15_000 });
    await rowA.getByRole("checkbox", { name: "Select row" }).check();
    await rowB.getByRole("checkbox", { name: "Select row" }).check();

    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("2 department(s) archived.")).toBeVisible({ timeout: 15_000 });

    const archivedA = await prisma.department.findUniqueOrThrow({ where: { id: emptyA.id } });
    const archivedB = await prisma.department.findUniqueOrThrow({ where: { id: emptyB.id } });
    expect(archivedA.status).toBe("ARCHIVED");
    expect(archivedB.status).toBe("ARCHIVED");

    // Admins always see inactive/archived departments in this workspace
    // (includeInactive follows canManageAll), so the just-archived rows are
    // still on screen — re-select them for the delete pass, plus the
    // occupied one that will fail its blocker check.
    await rowA.getByRole("checkbox", { name: "Select row" }).check();
    await rowB.getByRole("checkbox", { name: "Select row" }).check();
    const rowOccupied = page.getByRole("row", { name: /Bulk Occupied/ });
    await expect(rowOccupied).toBeVisible();
    await rowOccupied.getByRole("checkbox", { name: "Select row" }).check();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(/couldn't be deleted/)).toBeVisible({ timeout: 15_000 });

    const deletedA = await prisma.department.findUniqueOrThrow({ where: { id: emptyA.id } });
    const deletedB = await prisma.department.findUniqueOrThrow({ where: { id: emptyB.id } });
    const stillOccupied = await prisma.department.findUniqueOrThrow({ where: { id: occupied.id } });
    expect(deletedA.deletedAt).toBeTruthy();
    expect(deletedB.deletedAt).toBeTruthy();
    expect(stillOccupied.deletedAt).toBeNull();
  });
});
