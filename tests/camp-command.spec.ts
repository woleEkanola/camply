import { test, expect } from "@playwright/test";
import { prisma, loginWithPassword } from "./helpers";
import { hashPassword } from "../src/lib/auth";

test.describe("Camp Command", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `${Date.now()}`;
  let organizationId = "";
  let campId = "";
  let ownerEmail = "";
  let teacherEmail = "";
  let teacherStaffId = "";

  test.beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: `E2E Camp Command ${stamp}`, slug: `e2e-camp-command-${stamp}` },
    });
    organizationId = organization.id;
    const camp = await prisma.camp.create({
      data: {
        organizationId,
        name: `E2E Camp Command ${stamp}`,
        slug: `e2e-camp-command-camp-${stamp}`,
        year: 2026,
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-31"),
        status: "OPEN",
        active: true,
        approvalMode: "AUTO",
      },
    });
    campId = camp.id;
    await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });

    ownerEmail = `e2e-command-owner-${stamp}@camply.test`;
    teacherEmail = `e2e-command-teacher-${stamp}@camply.test`;
    await prisma.user.create({
      data: {
        email: ownerEmail,
        password: await hashPassword("password123"),
        role: "OWNER",
        organizationId,
      },
    });
    const teacher = await prisma.user.create({
      data: {
        email: teacherEmail,
        password: await hashPassword("password123"),
        role: "TEACHER",
        organizationId,
      },
    });
    const staff = await prisma.staffProfile.create({
      data: {
        userId: teacher.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E Command",
        lastName: "Teacher",
        email: teacherEmail,
        phone: `080${stamp.slice(-9).padStart(9, "0")}`,
      },
    });
    teacherStaffId = staff.id;
  });

  test.afterAll(async () => {
    if (organizationId) {
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
  });

  test("an owner sets up Camp Command and appoints a teacher with selected access", async ({ page }) => {
    await loginWithPassword(page, ownerEmail, "password123");
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Camp Command" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Set up Camp Command" }).click();
    await expect(page.getByTestId("camp-command-settings")).toBeVisible({ timeout: 20_000 });

    await page.getByLabel("Teacher", { exact: true }).selectOption(teacherStaffId);
    await page.getByLabel("Individual access").selectOption("CUSTOM");
    const appointmentSection = page.locator("section", { hasText: "Appoint a teacher" });
    await appointmentSection.getByLabel("Registrations and approvals", { exact: true }).check();
    await page.getByRole("button", { name: "Appoint Camp Commandant" }).click();

    await expect(page.getByText("Camp Commandant appointed.")).toBeVisible({ timeout: 15_000 });
    const currentCommand = page.getByText("E2E Command Teacher").locator("..");
    await expect(currentCommand).toContainText("Camp Commandant");

    const commandPosition = await prisma.position.findFirstOrThrow({ where: { campId, leadershipRole: "COMMANDANT" } });
    const assistantPosition = await prisma.position.findFirstOrThrow({ where: { campId, leadershipRole: "ASSISTANT_COMMANDANT" } });
    expect(assistantPosition.parentPositionId).toBe(commandPosition.id);
  });

  test("the appointed teacher can switch into only the granted admin areas", async ({ page }) => {
    await loginWithPassword(page, teacherEmail, "password123");
    await expect(page.getByRole("button", { name: "Switch context" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Switch context" }).click();
    // ContextSwitcher options are HeadlessUI Menu.Items — the cloned <Link>
    // is exposed as role="menuitem", not "link" (same as parent-teacher-dual-role.spec.ts).
    await page.getByRole("menuitem", { name: "Camp Commandant" }).click();
    await expect(page.getByRole("heading", { name: "Camp Commandant" })).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole("link", { name: "Registrations", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Campers", exact: true })).toHaveCount(0);

    await page.goto("/admin/registrations");
    await expect(page.getByRole("heading", { name: "Registrations" })).toBeVisible({ timeout: 20_000 });

    await page.goto("/admin/accommodation");
    await expect(page.getByRole("heading", { name: "Access not included" })).toBeVisible({ timeout: 20_000 });
  });
});
