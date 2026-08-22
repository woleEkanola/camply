import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, fieldByLabel } from "./helpers";

test.describe("Attendance session reopen", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);
  const ids: Record<string, string[]> = { users: [], campers: [], registrations: [], sessions: [], scored: [], rules: [], tribes: [] };
  let campId: string;
  let tribeId: string;
  let camperName: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    const stamp = `${Date.now()}`;
    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Reopen Tribe ${stamp}` } });
    tribeId = tribe.id; ids.tribes.push(tribe.id);

    const parent = await prisma.user.create({ data: { email: `e2e-attreopen-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    ids.users.push(parent.id);
    camperName = `E2E Reopen Camper ${stamp}`;
    const camper = await prisma.camper.create({ data: { name: camperName, firstName: "E2E", lastName: `Reopen ${stamp}`, dateOfBirth: new Date(2013, 1, 1), gender: "MALE", userId: parent.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
    ids.campers.push(camper.id);
    const registration = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId: ctx.campusId, tribeId: tribe.id, status: "CHECKED_IN", qrToken: `E2E-ATTREOPEN-${stamp}`, registrationNumber: `E2E-ATTREOPEN-${stamp}` } });
    ids.registrations.push(registration.id);
  });

  test.afterAll(async () => {
    const sessions = await prisma.attendanceSession.findMany({ where: { campId, tribeId }, select: { id: true, scoredSessionId: true } });
    ids.sessions.push(...sessions.map((s) => s.id));
    ids.scored.push(...sessions.flatMap((s) => (s.scoredSessionId ? [s.scoredSessionId] : [])));
    const scoredRows = await prisma.scoredSession.findMany({ where: { id: { in: ids.scored } }, select: { ruleId: true } });
    ids.rules.push(...scoredRows.flatMap((row) => (row.ruleId ? [row.ruleId] : [])));
    await prisma.attendanceRecord.deleteMany({ where: { sessionId: { in: ids.sessions } } });
    await prisma.attendanceSession.deleteMany({ where: { id: { in: ids.sessions } } });
    await prisma.scoreEvent.deleteMany({ where: { registrationId: { in: ids.registrations } } });
    await prisma.scoredSession.deleteMany({ where: { id: { in: ids.scored } } });
    await prisma.scoreRule.deleteMany({ where: { id: { in: ids.rules } } });
    await prisma.registration.deleteMany({ where: { id: { in: ids.registrations } } });
    await prisma.camper.deleteMany({ where: { id: { in: ids.campers } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.tribe.deleteMany({ where: { id: { in: ids.tribes } } });
  });

  test("admin reopens a closed session and a corrective re-mark still awards points", async ({ page }) => {
    const tribeName = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } }).then((t) => t.name);
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/tribes");
    await expect(page.getByTestId("tribe-hub")).toBeVisible({ timeout: 15000 });
    await page.getByRole("combobox", { name: "Choose tribe" }).selectOption({ label: tribeName });
    await page.getByRole("button", { name: "Attendance", exact: true }).click();
    await expect(page.getByTestId("camp-attendance-panel")).toBeVisible();

    await fieldByLabel(page, "Session name").fill("E2E Session Correction");
    await fieldByLabel(page, "Late after").fill("10");
    await page.getByRole("button", { name: "Create & open" }).click();
    await expect(page.getByText("E2E Session Correction").first()).toBeVisible({ timeout: 10000 });

    const row = page.getByTestId("attendance-roster-row").filter({ hasText: camperName });
    await expect(row).toBeVisible();

    // Close the session — status buttons should now be disabled.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("Session closed.")).toBeVisible({ timeout: 10000 });
    await expect(row.getByRole("button", { name: "Present" })).toBeDisabled();

    const registrationId = ids.registrations[0];
    // closeSession's sweep auto-marked everyone unrecorded ABSENT.
    await expect.poll(() => prisma.attendanceRecord.findFirst({ where: { registrationId } }).then((r) => r?.status)).toBe("ABSENT");

    // Reopen — status buttons become usable again.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByText("Session reopened.")).toBeVisible({ timeout: 10000 });
    await expect(row.getByRole("button", { name: "Present" })).toBeEnabled({ timeout: 10000 });

    // Correct the mistaken ABSENT to PRESENT — this must still award points
    // (the scoreVersion/idempotencyKey trap: a hard delete on close/reopen
    // would silently break this re-mark).
    await row.getByRole("button", { name: "Present" }).click();
    await expect(row.getByText("PRESENT", { exact: true })).toBeVisible();
    await expect.poll(() => prisma.scoreEvent.count({ where: { registrationId, points: { gt: 0 }, voidedAt: null } })).toBe(1);
  });
});
