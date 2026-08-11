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

  test("camp-wide Organogram renders the connected tree and drag-to-reparent persists", async ({ page }) => {
    await prisma.position.update({ where: { id: volPositionId }, data: { parentPositionId: null } });
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Organogram" }).click();

    const organogram = page.getByTestId("camp-organogram");
    await expect(organogram).toBeVisible();
    await expect(page.getByTestId("organogram-chart-view")).toBeVisible();
    const zoomLevel = page.getByTestId("organogram-zoom-level");
    await expect(zoomLevel).toHaveText("100%");
    await page.getByTestId("organogram-chart-view").hover();
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => Number((await zoomLevel.textContent())?.replace("%", ""))).toBeGreaterThan(100);
    await page.getByRole("button", { name: "100%" }).click();
    await expect(zoomLevel).toHaveText("100%");
    await expect(page.getByTestId(`organogram-position-${directorPositionId}`)).toContainText("Camp Director");
    await expect(page.getByTestId(`organogram-position-${headPositionId}`)).toContainText(deptName);

    // Large simulation camps can have dozens of independent roots. Search
    // keeps the branch under test together and exercises the real admin
    // workflow for focusing a crowded chart before editing it.
    await page.getByPlaceholder("Find a role or person").fill(deptName);

    const sourceHandle = page.getByTestId(`organogram-position-${volPositionId}`).getByRole("button", { name: "Drag position" });
    const target = page.getByTestId(`organogram-position-${headPositionId}`);
    const sourceBox = await sourceHandle.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
    await page.mouse.up();

    const moveDialog = page.getByTestId("dialog-panel");
    await expect(moveDialog).toBeVisible();
    await expect(moveDialog.getByText("Move position", { exact: true })).toBeVisible();
    await expect(moveDialog.getByLabel("Reports to")).toHaveValue(headPositionId);
    await moveDialog.getByRole("button", { name: "Confirm move" }).click();

    await expect.poll(async () => (await prisma.position.findUniqueOrThrow({ where: { id: volPositionId } })).parentPositionId).toBe(headPositionId);
    await expect(page.getByText("Hierarchy updated.")).toBeVisible();
  });

  test("mobile Organogram defaults to a properly nested, editable hierarchy", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Organogram" }).click();

    await expect(page.getByTestId("organogram-nested-view")).toBeVisible();
    await expect(page.getByTestId(`organogram-position-${directorPositionId}`)).toBeVisible();
    await expect(page.getByTestId(`organogram-position-${headPositionId}`)).toBeVisible();
    await expect(page.getByTestId(`organogram-position-${volPositionId}`)).toBeVisible();

    // The nested tree is the mobile default, while the chart remains fully
    // touch-zoomable when selected. Synthetic pointer events let this test
    // exercise two simultaneous touch points in Chromium.
    await page.getByRole("button", { name: "Chart", exact: true }).click();
    const chart = page.getByTestId("organogram-chart-view");
    await expect(chart).toBeVisible();
    await chart.evaluate((element) => {
      const emit = (type: string, pointerId: number, clientX: number, clientY: number, isPrimary = false) =>
        element.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: "touch", clientX, clientY, isPrimary }));
      emit("pointerdown", 1, 130, 300, true);
      emit("pointerdown", 2, 260, 300);
      emit("pointermove", 1, 90, 300, true);
      emit("pointermove", 2, 300, 300);
      emit("pointerup", 1, 90, 300, true);
      emit("pointerup", 2, 300, 300);
    });
    const zoomLevel = page.getByTestId("organogram-zoom-level");
    await expect.poll(async () => Number((await zoomLevel.textContent())?.replace("%", ""))).toBeGreaterThan(100);
    await page.getByRole("button", { name: "Nested", exact: true }).click();

    await page.getByTestId(`organogram-position-${volPositionId}`).getByRole("button").first().click();
    const positionDialog = page.getByTestId("dialog-panel");
    await expect(positionDialog).toBeVisible();
    await expect(positionDialog.getByText(new RegExp(deptName)).first()).toBeVisible();
    await expect(positionDialog.getByRole("button", { name: "Move under…" })).toBeVisible();
    await expect(positionDialog.getByRole("button", { name: /Assign person|Replace holder/ })).toBeVisible();
  });
});
