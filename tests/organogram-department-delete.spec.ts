import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Covers department delete/archive surfaced directly in the organogram's
 * position detail dialog (rather than requiring a trip to the Directory
 * tab), reusing the existing deletionBlockers guard and the Camp Command
 * system-department protection.
 */
test.describe("Organogram: department delete/archive from the position detail dialog", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let emptyDeptId: string;
  let emptyDeptPositionId: string;
  let blockedDeptId: string;
  let blockedDeptPositionId: string;
  let commandantPositionId: string;
  const emails: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const emptyDept = await prisma.department.create({ data: { organizationId, campId, name: `E2E Empty Dept ${stamp}` } });
    emptyDeptId = emptyDept.id;
    emptyDeptPositionId = (await prisma.position.create({ data: { campId, departmentId: emptyDept.id, name: `E2E Empty Role ${stamp}` } })).id;

    const blockedDept = await prisma.department.create({ data: { organizationId, campId, name: `E2E Blocked Dept ${stamp}` } });
    blockedDeptId = blockedDept.id;
    blockedDeptPositionId = (await prisma.position.create({ data: { campId, departmentId: blockedDept.id, name: `E2E Blocked Role ${stamp}` } })).id;
    const email = `e2e-orgdeptdel-${stamp}@camply.test`;
    emails.push(email);
    const user = await prisma.user.create({ data: { email, password: "x", role: "TEACHER", organizationId, homeCampusId: campusId } });
    await prisma.staffProfile.create({
      data: {
        userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: "E2E-Blocked", lastName: "Staff", phone: `080${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`, email,
        departmentId: blockedDept.id,
      },
    });

    let cmdDept = await prisma.department.findFirst({ where: { campId, systemKey: "CAMP_COMMAND", deletedAt: null } });
    if (!cmdDept) cmdDept = await prisma.department.create({ data: { organizationId, campId, systemKey: "CAMP_COMMAND", name: "Camp Command" } });
    let commandant = await prisma.position.findFirst({ where: { campId, leadershipRole: "COMMANDANT", deletedAt: null } });
    if (!commandant) commandant = await prisma.position.create({ data: { campId, departmentId: cmdDept.id, name: "Camp Commandant", leadershipRole: "COMMANDANT", displayOrder: -100 } });
    commandantPositionId = commandant.id;
  });

  test.afterAll(async () => {
    await prisma.staffProfile.deleteMany({ where: { departmentId: blockedDeptId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.position.deleteMany({ where: { id: { in: [emptyDeptPositionId, blockedDeptPositionId] } } });
    await prisma.department.deleteMany({ where: { id: { in: [emptyDeptId, blockedDeptId] } } });
  });

  test("a blocked department shows the blocker sentence with Delete disabled; an empty one deletes cleanly", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Organogram" }).click();
    await expect(page.getByTestId("camp-organogram")).toBeVisible({ timeout: 20000 });

    // Blocked department.
    await page.getByTestId(`organogram-position-${blockedDeptPositionId}`).click();
    const detailDialog = page.getByTestId("dialog-panel");
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText(/active people.*current role assignments.*child departments/i)).toBeVisible({ timeout: 10000 });
    await expect(detailDialog.getByRole("button", { name: "Delete department" })).toBeDisabled();
    await detailDialog.getByRole("button", { name: "Close" }).click().catch(() => {});
    await page.keyboard.press("Escape");

    // Empty department — deletable.
    await page.getByTestId(`organogram-position-${emptyDeptPositionId}`).click();
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByRole("button", { name: "Delete department" })).toBeEnabled({ timeout: 10000 });
    await detailDialog.getByRole("button", { name: "Delete department" }).click();

    await expect
      .poll(async () => (await prisma.department.findUniqueOrThrow({ where: { id: emptyDeptId } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();
  });

  test("the Camp Command department exposes no delete/archive controls", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Organogram" }).click();
    await expect(page.getByTestId("camp-organogram")).toBeVisible({ timeout: 20000 });

    await page.getByTestId(`organogram-position-${commandantPositionId}`).click();
    const detailDialog = page.getByTestId("dialog-panel");
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText(/managed automatically/i)).toBeVisible({ timeout: 10000 });
    await expect(detailDialog.getByRole("button", { name: "Delete department" })).toHaveCount(0);
    await expect(detailDialog.getByRole("button", { name: "Archive department" })).toHaveCount(0);
  });
});
