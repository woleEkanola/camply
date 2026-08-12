import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginWithPassword } from "./helpers";
import { seedTeenCampDepartments } from "../src/server/departments/jdSeed";

function channelToLinear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: string, background: string) {
  const channels = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const luminance = (color: string) => {
    const [red, green, blue] = channels(color).map(channelToLinear);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe("JD Departments and daily operations", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
  const ownerEmail = `e2e-departments-owner-${stamp}@camply.test`;
  const volunteerEmail = `e2e-departments-vmd-${stamp}@camply.test`;
  const teacherEmail = `e2e-departments-teacher-${stamp}@camply.test`;
  let organizationId = "";
  let campId = "";
  let vmdId = "";
  let teacherId = "";

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
    const teacher = await prisma.user.create({ data: { email: teacherEmail, password, role: "TEACHER", firstName: "Preference", lastName: "Teacher", organizationId } });
    const teacherProfile = await prisma.staffProfile.create({ data: { userId: teacher.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Preference", lastName: "Teacher", phone: "08098765432", email: teacher.email, preferredDepartmentId: vmd.id, photoUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" } });
    teacherId = teacherProfile.id;
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
    await expect(page.getByText("People & Programmes", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Operations", { exact: true }).first()).toBeVisible();

    const search = page.getByRole("textbox", { name: "Search departments, roles, or people" });
    await search.fill("VMD Volunteer");
    await expect(page.getByRole("button").filter({ hasText: "Venue Management Department (VMD)" })).toBeVisible();
    await expect(page.getByRole("button").filter({ hasText: "Registration" })).toHaveCount(0);
    await search.fill("");

    const card = page.getByRole("button").filter({ hasText: "Venue Management Department (VMD)" });
    await expect(card).toContainText("Assistant");

    const departmentTitle = card.getByRole("heading", { name: "Venue Management Department (VMD)" });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((nextTheme) => {
        localStorage.setItem("camply-theme", nextTheme);
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
      }, theme);
      const colors = await departmentTitle.evaluate((element) => {
        let surface: Element | null = element.parentElement;
        while (surface && getComputedStyle(surface).backgroundColor.endsWith(", 0)")) surface = surface.parentElement;
        return {
          foreground: getComputedStyle(element).color,
          background: getComputedStyle(surface!).backgroundColor,
        };
      });
      expect(contrastRatio(colors.foreground, colors.background), `${theme} department title contrast`).toBeGreaterThanOrEqual(4.5);
    }
    await card.click();

    await expect(page.getByRole("heading", { name: "Venue Management Department (VMD)" })).toBeVisible();
    for (const tab of ["Overview", "People & roles", "Responsibilities", "Checklist", "History"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }
    await expect(page.getByText("Deputy Camp Commandant (Operations)")).toBeVisible();
    await expect(page.getByText("Assistant leader", { exact: true })).toBeVisible();

    const metricValue = page.getByText("Active people", { exact: true }).locator("..").locator("p").nth(1);
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((nextTheme) => {
        localStorage.setItem("camply-theme", nextTheme);
        document.documentElement.classList.toggle("dark", nextTheme === "dark");
      }, theme);
      const colors = await metricValue.evaluate((element) => {
        let surface: Element | null = element.parentElement;
        while (surface && getComputedStyle(surface).backgroundColor.endsWith(", 0)")) surface = surface.parentElement;
        return {
          foreground: getComputedStyle(element).color,
          background: getComputedStyle(surface!).backgroundColor,
        };
      });
      expect(contrastRatio(colors.foreground, colors.background), `${theme} metric contrast`).toBeGreaterThanOrEqual(4.5);
    }

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

  test("unified Departments hub provides cards, list, organogram, contacts, and legacy redirects", async ({ page }) => {
    await loginWithPassword(page, ownerEmail, "password123");
    await page.goto("/admin/departments");
    await expect(page.getByRole("heading", { name: "Departments" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Departments", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Organogram" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Contacts" })).toBeVisible();

    await page.getByRole("button", { name: "List view" }).click();
    await expect(page.getByRole("columnheader", { name: "Department" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Venue Management Department (VMD)" })).toBeVisible();
    await page.getByRole("button", { name: "Card view" }).click();
    await expect(page.getByRole("button").filter({ hasText: "Venue Management Department (VMD)" })).toBeVisible();

    await page.getByRole("tab", { name: "Contacts" }).click();
    await expect(page.getByText("Camp contacts", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/Search people, departments/i)).toBeVisible();

    await page.getByRole("tab", { name: "Organogram" }).click();
    await expect(page.getByRole("button", { name: "Chart" })).toBeVisible();

    await page.goto("/admin/camp-structure");
    await expect(page).toHaveURL(/\/admin\/departments\?view=contacts/);
    await expect(page.getByRole("tab", { name: "Contacts" })).toHaveAttribute("aria-selected", "true");
  });

  test("VMD volunteer gets a mobile guide and completes today’s duties in one tap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginWithPassword(page, volunteerEmail, "password123");
    await page.goto("/volunteer/department");
    await expect(page).toHaveURL(/\/volunteer\/departments\?view=mine/);
    await expect(page.getByRole("tab", { name: "My department" })).toBeVisible();
    expect(await page.getByRole("tab").allTextContents()).toEqual(["My department", "Departments", "Contacts", "Organogram"]);
    await expect(page.getByRole("heading", { name: "My department" })).toBeVisible();
    await expect(page.getByText("Venue Management Department (VMD)", { exact: true })).toBeVisible();
    await expect(page.getByText("VMD Hall & Environs Lead", { exact: true }).first()).toBeVisible();
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

  test("teacher list shows form preference and supports manual and strategy-based department assignment", async ({ page }) => {
    await loginWithPassword(page, ownerEmail, "password123");
    await page.goto("/admin/teachers");
    await expect(page.getByText("Preferences recorded", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Prefers: Venue Management Department (VMD)", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByTestId("teacher-advanced-filters")).toBeVisible();
    await page.getByRole("combobox", { name: "Filter by assignment status" }).selectOption("UNASSIGNED");
    await page.getByRole("combobox", { name: "Teachers per page" }).selectOption("150");
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByLabel("Skills").uncheck();
    await expect(page.getByRole("columnheader", { name: "Skills" })).toHaveCount(0);
    await page.locator("div.fixed.inset-0.z-10").click({ position: { x: 5, y: 5 } });

    await page.getByRole("button", { name: "View Preference Teacher photo full screen" }).click();
    await expect(page.getByRole("heading", { name: "Preference Teacher photo" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    const assignment = page.getByRole("combobox", { name: "Assign Preference Teacher to department" });
    await assignment.selectOption(vmdId);
    await expect.poll(async () => (await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacherId } })).departmentId).toBe(vmdId);
    await assignment.selectOption("");

    await page.getByRole("button", { name: "Assign Departments" }).click();
    await expect(page.getByRole("heading", { name: "Auto-assign unassigned teachers" })).toBeVisible();
    await page.getByRole("button", { name: /Balance capacity/ }).click();
    await page.getByRole("button", { name: /Assign 1 unassigned/ }).click();
    await expect.poll(async () => (await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacherId } })).departmentId).not.toBeNull();
  });

  test("teacher dashboard links directly to upload or replace the profile photo", async ({ page }) => {
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher");
    await page.getByRole("link", { name: "Replace photo" }).click();
    await expect(page).toHaveURL(/\/profile\?tab=photo/);
    await expect(page.getByRole("heading", { name: "Profile Photo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload Image File" })).toBeVisible();
  });
});
