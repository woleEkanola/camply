import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail, drawerPanel } from "./helpers";

test.describe("Camp Structure — mobile-first directory", () => {
  test.describe.configure({ mode: "serial" });

  const managerEmail = `e2e-cs-manager-${Date.now()}@camply.test`;
  const reportEmail = `e2e-cs-report-${Date.now()}@camply.test`;
  let managerId: string;
  let reportId: string;
  let departmentId: string;
  let directorPositionId: string;
  let headPositionId: string;
  let volPositionId: string;
  let managerAssignmentId: string;
  let reportAssignmentId: string;
  let campId: string;
  let orgId: string;

  test.beforeAll(async () => {
    const { organizationId, campId: fixtureCampId, campusId } = await getFixtureOrgContext();
    campId = fixtureCampId;
    orgId = organizationId;

    // 1. Create department
    const dept = await prisma.department.create({
      data: {
        organizationId,
        campId,
        name: "E2E Structure Department",
        responsibilities: ["Do the thing", "Do the other thing"],
      },
    });
    departmentId = dept.id;

    // 2. Create staff profiles.
    // NOTE: the position-tree fixture below creates PositionAssignment rows
    // directly via Prisma, which does NOT run hierarchySync (that only fires
    // from the position.assignPosition/movePosition tRPC mutations — see
    // src/server/utils/hierarchySync.ts). Camp Directory groups staff by
    // departmentId/isDepartmentHead/isAssistantHead, so those fields have to
    // be set explicitly here to mirror what hierarchySync would have written,
    // or the manager lands in "Not in a department" instead of Head.
    const managerUser = await prisma.user.create({
      data: { email: managerEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    const manager = await prisma.staffProfile.create({
      data: {
        userId: managerUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "CS",
        lastName: "ManagerE2E",
        phone: "+1-555-0500",
        email: managerEmail,
        approvedAt: new Date(),
        departmentId: dept.id,
        isDepartmentHead: true,
        preferredCampusId: campusId,
      },
    });
    managerId = manager.id;

    const reportUser = await prisma.user.create({
      data: { email: reportEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    const report = await prisma.staffProfile.create({
      data: {
        userId: reportUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "CS",
        lastName: "ReportE2E",
        phone: "+234-800-0600",
        email: reportEmail,
        approvedAt: new Date(),
        departmentId: dept.id,
        reportsToId: manager.id,
      },
    });
    reportId = report.id;

    // 3. Create position hierarchy (mirrors what hierarchySync would derive
    // from these same names, kept in sync with the StaffProfile flags above).
    const directorPos = await prisma.position.create({
      data: { name: "Camp Director", campId, displayOrder: 1 },
    });
    directorPositionId = directorPos.id;

    const headPos = await prisma.position.create({
      data: {
        name: `${dept.name} Head`,
        campId,
        departmentId: dept.id,
        parentPositionId: directorPos.id,
        displayOrder: 2,
      },
    });
    headPositionId = headPos.id;

    const volPos = await prisma.position.create({
      data: {
        name: `${dept.name} Volunteer`,
        campId,
        departmentId: dept.id,
        parentPositionId: headPos.id,
        displayOrder: 3,
      },
    });
    volPositionId = volPos.id;

    // 4. Assign staff profiles to positions
    const managerAssign = await prisma.positionAssignment.create({
      data: { positionId: headPos.id, staffId: manager.id, isCurrent: true },
    });
    managerAssignmentId = managerAssign.id;

    const reportAssign = await prisma.positionAssignment.create({
      data: { positionId: volPos.id, staffId: report.id, isCurrent: true },
    });
    reportAssignmentId = reportAssign.id;
  });

  test.afterAll(async () => {
    // Cleanup assignments
    await prisma.positionAssignment.deleteMany({
      where: { id: { in: [managerAssignmentId, reportAssignmentId] } },
    });
    // Cleanup positions
    await prisma.position.deleteMany({
      where: { id: { in: [directorPositionId, headPositionId, volPositionId] } },
    });
    // Cleanup departments
    await prisma.department.deleteMany({
      where: { id: departmentId },
    });
    // Cleanup staff and users
    await deleteStaffByEmail(managerEmail);
    await deleteStaffByEmail(reportEmail);
  });

  test("renders one merged list of collapsible department sections — no tabs", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    // The old Leadership/Directory/Departments tab strip is gone entirely.
    await expect(page.getByRole("tab")).toHaveCount(0);

    const header = page.getByTestId(`dept-section-header-${departmentId}`);
    await expect(header).toBeVisible({ timeout: 15000 });
    const wasExpanded = (await header.getAttribute("aria-expanded")) === "true";

    await header.click();
    await expect(header).toHaveAttribute("aria-expanded", wasExpanded ? "false" : "true");
  });

  test("expanding a section reveals Head and Members chips grouped correctly", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    const header = page.getByTestId(`dept-section-header-${departmentId}`);
    await expect(header).toBeVisible({ timeout: 15000 });
    if ((await header.getAttribute("aria-expanded")) !== "true") {
      await header.click();
    }

    const body = page.getByTestId(`dept-section-body-${departmentId}`);
    await expect(body).toBeVisible();
    await expect(body.getByText("CS ManagerE2E")).toBeVisible();
    await expect(body.getByText("CS ReportE2E")).toBeVisible();

    // Manager is the Head (grouped above the "Members" label), the report is
    // an ordinary member — assert relative order rather than exact DOM shape.
    const bodyText = await body.innerText();
    expect(bodyText.indexOf("CS ManagerE2E")).toBeLessThan(bodyText.indexOf("CS ReportE2E"));
  });

  test("department overflow menu opens the Operations Center drawer", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    await page.getByTestId(`dept-section-menu-${departmentId}`).click();
    await page.getByRole("menuitem", { name: "Manage positions" }).click();

    const drawer = drawerPanel(page);
    await expect(drawer.getByText("Department Operations Center")).toBeVisible({ timeout: 10000 });
    await expect(drawer.getByText("E2E Structure Department").first()).toBeVisible();
    // "Manage positions" deep-links straight to the Positions tab.
    await expect(drawer.getByTestId("position-manager")).toBeVisible();
  });

  test("search finds a person by name, expands their department, and opens the profile sheet", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    await page.getByTestId("directory-search-input").fill("ManagerE2E");
    const results = page.getByTestId("directory-search-results");
    await expect(results.getByText("CS ManagerE2E")).toBeVisible({ timeout: 10000 });
    await results.getByText("CS ManagerE2E").click();

    await expect(page.getByTestId("staff-profile-sheet")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`dept-section-header-${departmentId}`)).toHaveAttribute("aria-expanded", "true");
  });

  test("search finds a person by phone number digits", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    // The old orgStructure.search only matched firstName/lastName —
    // searchDirectory additionally matches phone, so this is a net-new
    // capability, not a regression check.
    await page.getByTestId("directory-search-input").fill("8000600");
    const results = page.getByTestId("directory-search-results");
    await expect(results.getByText("CS ReportE2E")).toBeVisible({ timeout: 10000 });
  });
});
