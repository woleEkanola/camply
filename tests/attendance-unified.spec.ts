import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, fieldByLabel } from "./helpers";
import { hashPassword } from "../src/lib/auth";

test.describe("Unified teacher attendance", () => {
  test.describe.configure({ mode: "serial" });
  const ids: Record<string, string[]> = { users: [], campers: [], registrations: [], sessions: [], scored: [], rules: [], tribes: [] };
  let teacherEmail: string;
  let campId: string;
  let tribeId: string;
  let firstRegistrationId: string;
  let secondCamperName: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    const stamp = `${Date.now()}`;
    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Attendance Tribe ${stamp}` } });
    tribeId = tribe.id; ids.tribes.push(tribe.id);
    teacherEmail = `e2e-attendance-teacher-${stamp}@camply.test`;
    const teacher = await prisma.user.create({ data: { email: teacherEmail, password: await hashPassword("password123"), role: "TEACHER", organizationId: ctx.organizationId } });
    ids.users.push(teacher.id);
    await prisma.staffProfile.create({ data: { userId: teacher.id, organizationId: ctx.organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Attendance", lastName: "Teacher", phone: "08000000001", email: teacherEmail, assignedTribeId: tribe.id } });

    for (const index of [1, 2]) {
      const parent = await prisma.user.create({ data: { email: `e2e-attendance-parent-${index}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
      ids.users.push(parent.id);
      const name = `E2E Attendance Camper ${index} ${stamp}`;
      const camper = await prisma.camper.create({ data: { name, firstName: "E2E", lastName: `Camper ${index}`, dateOfBirth: new Date(2013, 1, index), gender: "MALE", userId: parent.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
      ids.campers.push(camper.id);
      const registration = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId: ctx.campusId, tribeId: tribe.id, status: "CHECKED_IN", qrToken: `E2E-ATTENDANCE-${index}-${stamp}`, registrationNumber: `E2E-ATT-${index}-${stamp}` } });
      ids.registrations.push(registration.id);
      if (index === 1) firstRegistrationId = registration.id;
      else secondCamperName = name;
    }

    let category = await prisma.scoreCategory.findFirst({ where: { campId, key: "attendance", enabled: true } });
    if (!category) category = await prisma.scoreCategory.create({ data: { campId, key: "attendance", name: "Attendance", defaultPoints: 10 } });
    const rule = await prisma.scoreRule.create({ data: { campId, categoryId: category.id, trigger: "SESSION", subject: "REGISTRATION", points: 10, tiers: [{ maxMinutesLate: 10, points: 10 }, { maxMinutesLate: null, points: 4 }], priority: 9999 } });
    ids.rules.push(rule.id);
  });

  test.afterAll(async () => {
    const sessions = await prisma.attendanceSession.findMany({ where: { campId, tribeId }, select: { id: true, scoredSessionId: true } });
    ids.sessions.push(...sessions.map((session) => session.id));
    ids.scored.push(...sessions.flatMap((session) => session.scoredSessionId ? [session.scoredSessionId] : []));
    await prisma.attendanceSession.deleteMany({ where: { id: { in: ids.sessions } } });
    await prisma.scoreEvent.deleteMany({ where: { registrationId: { in: ids.registrations } } });
    await prisma.scoredSession.deleteMany({ where: { id: { in: ids.scored } } });
    await prisma.scoreRule.deleteMany({ where: { id: { in: ids.rules } } });
    await prisma.registration.deleteMany({ where: { id: { in: ids.registrations } } });
    await prisma.camper.deleteMany({ where: { id: { in: ids.campers } } });
    await prisma.staffProfile.deleteMany({ where: { userId: { in: ids.users } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.tribe.deleteMany({ where: { id: { in: ids.tribes } } });
  });

  test("manual and search attendance share one session and score the leaderboard", async ({ page }) => {
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher/attendance");
    await fieldByLabel(page, "Session name").fill("E2E Morning Attendance");
    await fieldByLabel(page, "Late after").fill("10");
    await page.getByRole("button", { name: "Create & open" }).click();
    await expect(page.getByText("E2E Morning Attendance").first()).toBeVisible({ timeout: 10000 });

    const firstName = await prisma.registration.findUniqueOrThrow({ where: { id: firstRegistrationId }, include: { camper: true } }).then((registration) => registration.camper.name);
    const firstRow = page.getByText(firstName, { exact: true }).locator("xpath=ancestor::div[contains(@class,'sm:flex-row')][1]");
    await firstRow.getByRole("button", { name: "Present" }).click();
    await expect(firstRow.getByText("PRESENT")).toBeVisible();

    await page.getByPlaceholder("Search camper name or registration number").fill(secondCamperName);
    await page.getByRole("button", { name: "Search & mark" }).click();
    await expect(page.getByText(new RegExp(`${secondCamperName} marked present`, "i"))).toBeVisible();
    await expect.poll(() => prisma.attendanceRecord.count({ where: { session: { campId, tribeId } } })).toBe(2);
    await expect.poll(() => prisma.scoreEvent.count({ where: { registrationId: { in: ids.registrations }, scoredSessionId: { not: null } } })).toBe(2);

    await page.getByRole("button", { name: "Scan QR" }).click();
    await expect(page.getByTestId("scanner-video")).toBeVisible();
  });
});
