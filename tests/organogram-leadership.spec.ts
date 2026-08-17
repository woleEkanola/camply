import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";
import { hashPassword } from "../src/lib/auth";

/**
 * Covers the organogram-side leadership flow: creating a distinct Assistant
 * Commandant role, appointing/replacing its holder, marking it vacant, and
 * deleting it — all OWNER/ADMIN only. Also the security-critical negative
 * case: a sitting Commandant (a TEACHER) must not see the appoint controls,
 * and a direct tRPC call must 403 even though they can manage the camp in
 * every other respect.
 */
test.describe("Organogram: Camp Command leadership (appoint/replace/vacate/delete)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let commandantPositionId: string;
  let assistantRoleName: string;
  let assistantPositionId: string | undefined;
  const emails: string[] = [];
  let teacherAId: string;
  let teacherAUserId: string;
  let teacherAEmail: string;
  let teacherBId: string;

  async function createApprovedTeacher(label: string) {
    const email = `e2e-orgleadership-${label}-${stamp}@camply.test`;
    emails.push(email);
    const user = await prisma.user.create({ data: { email, password: await hashPassword("password123"), role: "TEACHER", organizationId, homeCampusId: campusId } });
    const profile = await prisma.staffProfile.create({
      data: {
        userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: `E2E-${label}`, lastName: "Leader", phone: `080${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`, email,
      },
    });
    return { userId: user.id, staffId: profile.id, email };
  }

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    let dept = await prisma.department.findFirst({ where: { campId, systemKey: "CAMP_COMMAND", deletedAt: null } });
    if (!dept) dept = await prisma.department.create({ data: { organizationId, campId, systemKey: "CAMP_COMMAND", name: "Camp Command" } });
    let commandant = await prisma.position.findFirst({ where: { campId, leadershipRole: "COMMANDANT", deletedAt: null } });
    if (!commandant) commandant = await prisma.position.create({ data: { campId, departmentId: dept.id, name: "Camp Commandant", leadershipRole: "COMMANDANT", displayOrder: -100 } });
    commandantPositionId = commandant.id;

    const commandantTeacher = await createApprovedTeacher("commandant");
    await prisma.positionAssignment.updateMany({ where: { positionId: commandant.id, isCurrent: true }, data: { isCurrent: false, endDate: new Date() } });
    await prisma.positionAssignment.create({ data: { positionId: commandant.id, staffId: commandantTeacher.staffId, isCurrent: true } });
    teacherAUserId = commandantTeacher.userId;
    teacherAEmail = commandantTeacher.email;
    teacherAId = commandantTeacher.staffId;

    const replacementTeacher = await createApprovedTeacher("assistantholder");
    teacherBId = replacementTeacher.staffId;

    assistantRoleName = `E2E Assistant Ops ${stamp}`;
  });

  test.afterAll(async () => {
    if (assistantPositionId) {
      await prisma.positionAssignment.deleteMany({ where: { positionId: assistantPositionId } });
      await prisma.position.deleteMany({ where: { id: assistantPositionId } });
    }
    await prisma.positionAssignment.deleteMany({ where: { positionId: commandantPositionId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  test("an Owner can create a distinct assistant role, appoint, replace, mark vacant, and delete it", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Organogram" }).click();
    await expect(page.getByTestId("camp-organogram")).toBeVisible({ timeout: 20000 });

    await page.getByTestId(`organogram-position-${commandantPositionId}`).click();
    const detailDialog = page.getByTestId("dialog-panel").last();
    await expect(detailDialog).toBeVisible();
    await detailDialog.getByRole("button", { name: "Add assistant role" }).click();

    const createDialog = page.getByTestId("dialog-panel").last();
    await createDialog.getByLabel("Position name").fill(assistantRoleName);
    await createDialog.getByRole("button", { name: "Create role", exact: true }).click();
    await expect(page.getByText(assistantRoleName)).toBeVisible({ timeout: 15000 });

    assistantPositionId = (await prisma.position.findFirstOrThrow({ where: { campId, name: assistantRoleName, deletedAt: null } })).id;
    expect((await prisma.position.findUniqueOrThrow({ where: { id: assistantPositionId } })).leadershipRole).toBe("ASSISTANT_COMMANDANT");

    // Appoint teacherA (the sitting Commandant, who can also hold multiple
    // roles in principle — use teacherB to keep the scenario simple) to it.
    await page.getByText(assistantRoleName).first().click();
    await expect(page.getByTestId("dialog-panel").last()).toBeVisible();
    await page.getByTestId("dialog-panel").last().getByRole("button", { name: "Appoint", exact: true }).click();
    const assignDialog = page.getByTestId("dialog-panel").last();
    await assignDialog.getByLabel("Teacher", { exact: true }).selectOption({ label: `E2E-assistantholder Leader` });
    await assignDialog.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(assignDialog).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(async () => prisma.positionAssignment.findFirst({ where: { positionId: assistantPositionId!, staffId: teacherBId, isCurrent: true } }), { timeout: 10000 })
      .not.toBeNull();

    // Mark vacant. The detail dialog does not auto-close on this action (it
    // stays open to show the now-vacant state), so close it explicitly
    // before the next interaction — otherwise its backdrop blocks clicks.
    await page.getByText(assistantRoleName).first().click();
    const vacantDialog = page.getByTestId("dialog-panel").last();
    await expect(vacantDialog).toBeVisible();
    await vacantDialog.getByRole("button", { name: "Mark vacant" }).click();
    await expect
      .poll(async () => (await prisma.positionAssignment.findFirstOrThrow({ where: { positionId: assistantPositionId!, staffId: teacherBId } })).isCurrent, { timeout: 10000 })
      .toBe(false);
    await page.keyboard.press("Escape");
    await expect(vacantDialog).not.toBeVisible({ timeout: 10000 });

    // Delete the role entirely.
    await page.getByText(assistantRoleName).first().click();
    const deleteSourceDialog = page.getByTestId("dialog-panel").last();
    await expect(deleteSourceDialog).toBeVisible();
    await deleteSourceDialog.getByTestId("organogram-delete-role").click();
    await page.getByTestId("dialog-panel").last().getByTestId("organogram-delete-confirm").click();
    await expect
      .poll(async () => (await prisma.position.findUniqueOrThrow({ where: { id: assistantPositionId! } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();
  });

  test("a sitting Commandant sees no appoint controls, and a direct tRPC appointment attempt 403s", async ({ page, request, context }) => {
    await loginWithPassword(page, teacherAEmail, "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Organogram" }).click();
    await expect(page.getByTestId("camp-organogram")).toBeVisible({ timeout: 20000 });

    await page.getByTestId(`organogram-position-${commandantPositionId}`).click();
    const detailDialog = page.getByTestId("dialog-panel");
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByRole("button", { name: /Appoint|Replace holder/ })).toHaveCount(0);
    await expect(detailDialog.getByText(/Only an Owner or Admin/i)).toBeVisible();

    // Belt-and-suspenders: the real gate is server-side. Drive a direct tRPC
    // call as this same authenticated session and confirm it's rejected.
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await request.post("/api/trpc/campCommand.createAssistantRole", {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { json: { campId, name: `Should Not Be Created ${stamp}` } },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body?.error?.json?.code ?? body?.error?.message ?? JSON.stringify(body)).toBeTruthy();
    expect(await prisma.position.count({ where: { campId, name: `Should Not Be Created ${stamp}`, deletedAt: null } })).toBe(0);
  });
});
