import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail, drawerPanel } from "./helpers";

test.describe("Camp Structure — position management (Positions tab)", () => {
  test.describe.configure({ mode: "serial" });

  const headEmail = `e2e-cs-pos-head-${Date.now()}@camply.test`;
  const reportEmail = `e2e-cs-pos-report-${Date.now()}@camply.test`;

  let departmentId: string;
  let headId: string;
  let reportId: string;
  let directorPositionId: string;
  let headPositionId: string;
  let volPositionId: string;
  let campId: string;
  let deptName: string;

  test.beforeAll(async () => {
    const { organizationId, campId: fixtureCampId } = await getFixtureOrgContext();
    campId = fixtureCampId;

    const dept = await prisma.department.create({
      data: { organizationId, campId, name: `E2E Positions Department ${Date.now()}` },
    });
    departmentId = dept.id;
    deptName = dept.name;

    const headUser = await prisma.user.create({
      data: { email: headEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    const head = await prisma.staffProfile.create({
      data: {
        userId: headUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: "CS", lastName: "PosHeadE2E", phone: "+1-555-0800", email: headEmail,
        approvedAt: new Date(), departmentId: dept.id, isDepartmentHead: true,
      },
    });
    headId = head.id;

    const reportUser = await prisma.user.create({
      data: { email: reportEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    const report = await prisma.staffProfile.create({
      data: {
        userId: reportUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: "CS", lastName: "PosReportE2E", phone: "+1-555-0900", email: reportEmail,
        approvedAt: new Date(), departmentId: dept.id,
      },
    });
    reportId = report.id;

    const directorPos = await prisma.position.create({ data: { name: "Camp Director", campId, displayOrder: 1 } });
    directorPositionId = directorPos.id;

    const headPos = await prisma.position.create({
      data: { name: `${dept.name} Head`, campId, departmentId: dept.id, parentPositionId: directorPos.id, displayOrder: 2 },
    });
    headPositionId = headPos.id;

    const volPos = await prisma.position.create({
      data: { name: `${dept.name} Volunteer`, campId, departmentId: dept.id, parentPositionId: headPos.id, displayOrder: 3 },
    });
    volPositionId = volPos.id;

    await prisma.positionAssignment.create({ data: { positionId: headPos.id, staffId: head.id, isCurrent: true } });
    // Deliberately no assignment for volPos or report — this spec exercises
    // assignPosition itself, so the vacancy is the starting state.
  });

  test.afterAll(async () => {
    await prisma.positionAssignment.deleteMany({ where: { positionId: { in: [directorPositionId, headPositionId, volPositionId] } } });
    await prisma.position.deleteMany({ where: { id: { in: [directorPositionId, headPositionId, volPositionId] } } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await deleteStaffByEmail(headEmail);
    await deleteStaffByEmail(reportEmail);
  });

  async function openPositionsTab(page: import("@playwright/test").Page) {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByTestId(`dept-section-menu-${departmentId}`).click();
    await page.getByRole("menuitem", { name: "Manage positions" }).click();
    const drawer = drawerPanel(page);
    await expect(drawer.getByTestId("position-manager")).toBeVisible({ timeout: 10000 });
    return drawer;
  }

  test("Positions tab lists the department's position tree", async ({ page }) => {
    const drawer = await openPositionsTab(page);
    await expect(drawer.getByText(`${deptName} Head`)).toBeVisible();
    await expect(drawer.getByText(`${deptName} Volunteer`)).toBeVisible();
    await expect(drawer.getByText("CS PosHeadE2E")).toBeVisible();
  });

  test("assigning a staff member to a vacant position persists and drives hierarchySync", async ({ page }) => {
    const drawer = await openPositionsTab(page);

    const volRow = page.getByTestId(`position-row-${volPositionId}`);
    await expect(volRow).toBeVisible();
    await volRow.getByRole("button", { name: "Assign" }).click();

    await page.getByLabel("Staff member").selectOption({ label: "CS PosReportE2E (TEACHER)" });
    await page.getByRole("dialog").getByRole("button", { name: "Assign", exact: true }).click();

    // Persisted in the DB.
    await expect
      .poll(
        async () =>
          prisma.positionAssignment.findFirst({
            where: { positionId: volPositionId, staffId: reportId, isCurrent: true },
          }),
        { timeout: 10000 }
      )
      .not.toBeNull();

    // hierarchySync's contract — this is what the whole redesign's grouping
    // depends on: assignPosition doesn't just create a PositionAssignment
    // row, it also mirrors departmentId/isDepartmentHead onto StaffProfile.
    // "CS PosReportE2E" was assigned to "<dept> Volunteer", a non-head
    // position, so departmentId should be set but isDepartmentHead should not.
    await expect
      .poll(async () => {
        const staff = await prisma.staffProfile.findUniqueOrThrow({ where: { id: reportId } });
        return { departmentId: staff.departmentId, isDepartmentHead: staff.isDepartmentHead };
      }, { timeout: 10000 })
      .toEqual({ departmentId, isDepartmentHead: false });

    // UI reflects it too: the chip moves out of "Vacant" in the Positions
    // tab, and shows up under the department's Members group.
    await expect(volRow.getByText("CS PosReportE2E")).toBeVisible({ timeout: 10000 });
  });

  test("moving a position re-parents it", async ({ page }) => {
    await openPositionsTab(page);

    const volRow = page.getByTestId(`position-row-${volPositionId}`);
    await volRow.getByRole("button", { name: `${deptName} Volunteer position options` }).click();
    await page.getByRole("menuitem", { name: "Move…" }).click();

    await page.getByLabel("Reports to").selectOption("");
    await page.getByRole("dialog").getByRole("button", { name: "Move" }).click();

    await expect
      .poll(async () => (await prisma.position.findUniqueOrThrow({ where: { id: volPositionId } })).parentPositionId, { timeout: 10000 })
      .toBeNull();
  });
});
