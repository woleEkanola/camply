import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginWithPassword } from "./helpers";

test.describe("Department auto-assign preview", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
  const ownerEmail = `e2e-auto-assign-owner-${stamp}@camply.test`;
  let organizationId = "";
  let campId = "";

  test.beforeAll(async () => {
    const password = await bcrypt.hash("password123", 12);
    const organization = await prisma.organization.create({ data: { name: `E2E Auto Assign ${stamp}`, slug: `e2e-auto-assign-${stamp}` } });
    organizationId = organization.id;
    const camp = await prisma.camp.create({ data: { name: `E2E Auto Assign Camp ${stamp}`, slug: `e2e-auto-assign-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), active: true, status: "OPEN", organizationId } });
    campId = camp.id;
    await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
    await prisma.user.create({ data: { email: ownerEmail, password, role: "OWNER", firstName: "AutoAssign", lastName: "Owner", organizationId } });

    const registration = await prisma.department.create({ data: { organizationId, campId, name: "Registration", status: "ACTIVE" } });
    const media = await prisma.department.create({ data: { organizationId, campId, name: "Media", status: "ACTIVE" } });
    const retired = await prisma.department.create({ data: { organizationId, campId, name: "Media Team (old)", status: "ACTIVE" } });
    await prisma.department.update({ where: { id: retired.id }, data: { deletedAt: new Date(), mergedIntoId: media.id } });

    const wantsMediaUser = await prisma.user.create({ data: { email: `e2e-auto-assign-media-${stamp}@camply.test`, password, role: "TEACHER", firstName: "WantsMedia", lastName: "Teacher", organizationId } });
    await prisma.staffProfile.create({ data: { userId: wantsMediaUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "WantsMedia", lastName: "Teacher", phone: "08055556666", email: wantsMediaUser.email, preferredDepartmentId: retired.id } });
    const noPreferenceUser = await prisma.user.create({ data: { email: `e2e-auto-assign-none-${stamp}@camply.test`, password, role: "TEACHER", firstName: "NoPreference", lastName: "Teacher", organizationId } });
    await prisma.staffProfile.create({ data: { userId: noPreferenceUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "NoPreference", lastName: "Teacher", phone: "08066667777", email: noPreferenceUser.email } });

    void registration;
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  test("previews department auto-assignment, resolving a merged-away preference, then applies it", async ({ page }) => {
    await loginWithPassword(page, ownerEmail, "password123");
    await page.goto("/admin/teachers");
    await expect(page.getByRole("button", { name: "Assign Departments" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Assign Departments" }).click();

    const dialog = page.getByRole("dialog").filter({ hasText: "Auto-assign unassigned teachers" });
    await expect(dialog.getByText(/Preview — 1 of 2 get their preference/)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("WantsMedia Teacher")).toBeVisible();
    await expect(dialog.getByText("NoPreference Teacher")).toBeVisible();
    await expect(dialog.getByText(/Media · preference/)).toBeVisible();

    await dialog.getByRole("button", { name: "Assign 2 teachers" }).click();
    await expect(page.getByText(/Assigned 2 teacher/)).toBeVisible({ timeout: 15_000 });

    const media = await prisma.department.findFirstOrThrow({ where: { organizationId, campId, name: "Media" } });
    const wantsMedia = await prisma.staffProfile.findFirstOrThrow({ where: { organizationId, campId, firstName: "WantsMedia" } });
    expect(wantsMedia.departmentId).toBe(media.id);
    const noPreference = await prisma.staffProfile.findFirstOrThrow({ where: { organizationId, campId, firstName: "NoPreference" } });
    expect(noPreference.departmentId).toBeTruthy();
  });
});
