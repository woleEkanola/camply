import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginWithPassword } from "./helpers";
import { seedTeenCampDepartments } from "../src/server/departments/jdSeed";

test.describe("JD Departments and daily operations", () => {
  test.describe.configure({ mode: "serial" });
  const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
  const ownerEmail = `e2e-departments-owner-${stamp}@camply.test`;
  const volunteerEmail = `e2e-departments-vmd-${stamp}@camply.test`;
  let organizationId = "";
  let campId = "";
  let vmdId = "";

  test.beforeAll(async () => {
    const password = await bcrypt.hash("password123", 12);
    const organization = await prisma.organization.create({ data: { name: `E2E Departments ${stamp}`, slug: `e2e-departments-${stamp}` } });
    organizationId = organization.id;
    const camp = await prisma.camp.create({ data: { name: `E2E Department Camp ${stamp}`, slug: `e2e-department-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), active: true, status: "OPEN", organizationId } });
    campId = camp.id;
    await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
    await prisma.user.create({ data: { email: ownerEmail, password, role: "OWNER", firstName: "Department", lastName: "Owner", organizationId } });
    const volunteer = await prisma.user.create({ data: { email: volunteerEmail, password, role: "VOLUNTEER", firstName: "VMD", lastName: "Volunteer", organizationId } });
    const profile = await prisma.staffProfile.create({ data: { userId: volunteer.id, organizationId, campId, type: "VOLUNTEER", status: "APPROVED", firstName: "VMD", lastName: "Volunteer", phone: "08012345678", email: volunteerEmail } });
    await seedTeenCampDepartments(prisma, { organizationId, campId, actorId: volunteer.id });
    const vmd = await prisma.department.findFirstOrThrow({ where: { campId, name: "Venue Management Department (VMD)" } });
    vmdId = vmd.id;
    const hall = await prisma.position.findFirstOrThrow({ where: { departmentId: vmd.id, name: "VMD Hall & Environs Lead" } });
    await prisma.positionAssignment.create({ data: { positionId: hall.id, staffId: profile.id } });
    await prisma.staffProfile.update({ where: { id: profile.id }, data: { departmentId: vmd.id } });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  test("admin can navigate the JD hierarchy and manage the five-tab VMD workspace", async ({ page }) => {
    await loginWithPassword(page, ownerEmail, "password123");
    await page.goto("/admin/departments");
    await expect(page.getByRole("heading", { name: "Departments" })).toBeVisible();
    await expect(page.getByText("People & Programmes", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Operations", { exact: true }).first()).toBeVisible();
    const card = page.getByRole("button").filter({ hasText: "Venue Management Department (VMD)" });
    await expect(card).toContainText("Assistant");
    await card.click();

    await expect(page.getByRole("heading", { name: "Venue Management Department (VMD)" })).toBeVisible();
    for (const tab of ["Overview", "People & roles", "Responsibilities", "Checklist", "History"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }
    await expect(page.getByText("Deputy Camp Commandant (Operations)")).toBeVisible();
    await expect(page.getByText("Assistant leader", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "People & roles" }).click();
    await expect(page.getByText("Venue Management Department (VMD) Assistant Leader", { exact: true })).toBeVisible();
    await expect(page.getByText("VMD Hall & Environs Lead", { exact: true })).toBeVisible();
    await expect(page.getByText("VMD Volunteer", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Responsibilities" }).click();
    await expect(page.getByRole("textbox", { name: "Responsibilities" })).toHaveValue(/Develop the venue preparation plan for the entire camp\./);
    await expect(page.getByRole("textbox", { name: "Authority" })).toHaveValue(/Reassign VMD personnel as needed\./);
    await expect(page.getByRole("textbox", { name: "Success measures" })).toHaveValue(/Every venue ready before scheduled activities\./);

    await page.getByRole("tab", { name: "Checklist" }).click();
    await expect(page.getByText("Arrange chairs.", { exact: true })).toBeVisible();
    await expect(page.getByText("Before Programme", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Add checklist item" }).click();
    const checklistDialog = page.getByTestId("dialog-panel");
    await checklistDialog.locator("input").first().fill("Inspect emergency exits");
    await checklistDialog.locator("select").first().selectOption("DAILY");
    await checklistDialog.getByRole("button", { name: "Create item" }).click();
    await expect(page.getByText("Inspect emergency exits", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByRole("button", { name: "Submit department report" })).toBeVisible();
  });

  test("VMD volunteer gets a mobile guide and completes today’s duties in one tap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginWithPassword(page, volunteerEmail, "password123");
    await page.goto("/volunteer/department");
    await expect(page.getByRole("heading", { name: "My department" })).toBeVisible();
    await expect(page.getByText("Venue Management Department (VMD) · VMD Hall & Environs Lead")).toBeVisible();
    await expect(page.getByText("Today’s progress")).toBeVisible();
    const duty = page.getByRole("button").filter({ hasText: "Arrange chairs according to the programme layout." });
    await expect(duty).toBeVisible();
    await duty.click();
    await expect(duty).toContainText("Completed");
    await expect.poll(async () => (await prisma.departmentChecklistExecution.findFirst({ where: { departmentId: vmdId, taskTitle: "Arrange chairs according to the programme layout.", completedAt: { not: null } } }))?.completedById).toBeTruthy();

    await page.getByRole("button", { name: "Department guide" }).click();
    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog.getByText("VMD Hall & Environs Lead", { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText("Arrange chairs according to programme requirements.")).toBeVisible();
    await expect(dialog.getByText("Restrict access while venue setup is in progress.")).toBeVisible();
    await expect(dialog.getByText("Programme venues always ready.")).toBeVisible();
  });
});
