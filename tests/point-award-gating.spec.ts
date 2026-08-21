import { test, expect } from "@playwright/test";
import { hashPassword } from "../src/lib/auth";
import { getFixtureOrgContext, loginWithPassword, prisma, drawerPanel } from "./helpers";

test.describe("Point award gating (restrictPointAwarding)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let campId = "";
  let organizationId = "";
  let tribeId = "";
  let categoryId = "";
  let teacherUserId = "";
  let teacherProfileId = "";
  let camperUserId = "";
  let camperId = "";
  let registrationId = "";
  let teacherEmail = "";
  let categoryName = "";
  let attendanceSessionId = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    organizationId = ctx.organizationId;
    const stamp = Date.now();
    teacherEmail = `gating-teacher-${stamp}@camply.test`;
    categoryName = `Gating Category ${stamp}`;

    // Fixture org's camp-wide switch is shared across the whole suite —
    // force a known baseline (off) now, restore it unconditionally in
    // afterAll so other specs relying on the default "any tribe-assigned
    // teacher can award" behavior are never left broken by this test.
    await prisma.leaderboardSettings.upsert({
      where: { campId },
      create: { campId, restrictPointAwarding: false },
      update: { restrictPointAwarding: false },
    });

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Gating Tribe ${stamp}`, color: "#7C3AED" } });
    tribeId = tribe.id;
    const category = await prisma.scoreCategory.create({ data: {
      campId, key: `E2E_GATING_${stamp}`, name: categoryName, defaultPoints: 5, kind: "MANUAL", sortOrder: -100,
    } });
    categoryId = category.id;

    const teacher = await prisma.user.create({ data: { email: teacherEmail, password: await hashPassword("password123"), role: "TEACHER", organizationId } });
    teacherUserId = teacher.id;
    const profile = await prisma.staffProfile.create({ data: { userId: teacher.id, organizationId, campId, type: "TEACHER", status: "APPROVED", assignedTribeId: tribe.id, firstName: "Gating", lastName: "Teacher", gender: "MALE", phone: "08000000011", email: teacherEmail } });
    teacherProfileId = profile.id;

    const parent = await prisma.user.create({ data: { email: `gating-camper-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
    camperUserId = parent.id;
    const camper = await prisma.camper.create({ data: { name: `Gating Camper ${stamp}`, gender: "MALE", userId: parent.id, organizationId, homeCampusId: ctx.campusId } });
    camperId = camper.id;
    const registration = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId: ctx.campusId, tribeId: tribe.id, status: "APPROVED", registrationNumber: `GATING-${stamp}` } });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.leaderboardSettings.upsert({
      where: { campId },
      create: { campId, restrictPointAwarding: false },
      update: { restrictPointAwarding: false },
    });
    const sessions = await prisma.scoredSession.findMany({ where: { campId, categoryId }, select: { id: true } });
    if (attendanceSessionId) await prisma.attendanceRecord.deleteMany({ where: { sessionId: attendanceSessionId } });
    if (attendanceSessionId) await prisma.attendanceSession.deleteMany({ where: { id: attendanceSessionId } });
    await prisma.sideEffect.deleteMany({ where: { type: { startsWith: "SCORE_" } } });
    await prisma.scoreEvent.deleteMany({ where: { registrationId } });
    await prisma.leaderboardStat.deleteMany({ where: { OR: [{ subjectId: registrationId }, { subjectId: tribeId }] } });
    await prisma.scoredSession.deleteMany({ where: { id: { in: sessions.map((row) => row.id) } } });
    await prisma.scoreCategory.deleteMany({ where: { id: categoryId } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    if (teacherProfileId) await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: [teacherUserId, camperUserId].filter(Boolean) } } });
    if (tribeId) await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  async function startAndAward(page: import("@playwright/test").Page) {
    const startRes = await page.request.post("/api/trpc/campPoints.startBatch", {
      data: { json: { campId, categoryId, tribeId, subjectAudience: "CAMPER" } },
    });
    if (!startRes.ok()) return { ok: false as const, code: (await startRes.json()).error?.json?.code };
    const batchId = (await startRes.json()).result?.data?.json?.id;
    const awardRes = await page.request.post("/api/trpc/campPoints.award", {
      data: { json: { batchId, registrationIds: [registrationId], entryMethod: "SELECT" } },
    });
    if (!awardRes.ok()) return { ok: false as const, code: (await awardRes.json()).error?.json?.code };
    return { ok: true as const };
  }

  test("switch off: tribe teacher awards freely; switch on: only designated staff can, attendance still works", async ({ page }) => {
    // Baseline — switch off, today's behavior.
    await loginWithPassword(page, teacherEmail, "password123");
    let result = await startAndAward(page);
    expect(result.ok).toBe(true);
    await expect.poll(() => prisma.scoreEvent.count({ where: { registrationId, categoryId } })).toBe(1);

    // Admin turns the switch on via the real Settings UI.
    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin?tab=settings");
    const toggle = page.getByTestId("restrict-point-awarding-toggle");
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    if (!(await toggle.isChecked())) await toggle.click();
    await expect.poll(() => prisma.leaderboardSettings.findUnique({ where: { campId } }).then((row) => row?.restrictPointAwarding)).toBe(true);

    // The same tribe-assigned teacher, not individually designated, now
    // has no Award button and the API rejects an award attempt outright —
    // while attendance marking still succeeds (the critical regression).
    await page.context().clearCookies();
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher/tribe");
    const hub = page.getByTestId("tribe-hub");
    await expect(hub).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("award-points-button")).toHaveCount(0);
    await expect(page.getByTestId("award-restricted-note")).toBeVisible();

    result = await startAndAward(page);
    expect(result.ok).toBe(false);
    expect(result.code).toBeTruthy();

    // Built directly via Prisma rather than the createSession mutation —
    // that input includes a z.date() field, which needs superjson's date
    // encoding to round-trip through a raw JSON POST; `mark` below (no
    // Date field) is the one that actually needs to prove attendance still
    // works for this teacher, so only that call goes through the real API.
    const attendanceSession = await prisma.attendanceSession.create({ data: {
      campId, tribeId, name: "Gating Attendance Check", date: new Date(), audience: "CAMPER", createdById: teacherUserId,
    } });
    attendanceSessionId = attendanceSession.id;
    const markRes = await page.request.post("/api/trpc/attendance.mark", {
      data: { json: { sessionId: attendanceSessionId, registrationId, status: "PRESENT", source: "MANUAL" } },
    });
    expect(markRes.ok()).toBe(true);

    // Admin designates this specific teacher; awarding works again.
    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByTestId("directory-search-input").fill(teacherEmail);
    const staffRow = page.getByTestId("directory-search-results").getByText(/Gating Teacher/).first();
    await expect(staffRow).toBeVisible({ timeout: 10_000 });
    await staffRow.click();
    await expect(page.getByTestId("staff-profile-sheet")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "View full profile" }).click();
    const drawer = drawerPanel(page);
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await drawer.getByRole("tab", { name: "Assignment" }).click();
    await drawer.getByRole("checkbox", { name: /May award points/i }).click();
    await expect.poll(() => prisma.staffProfile.findUnique({ where: { id: teacherProfileId } }).then((row) => row?.canAwardPoints)).toBe(true);

    await page.context().clearCookies();
    await loginWithPassword(page, teacherEmail, "password123");
    result = await startAndAward(page);
    expect(result.ok).toBe(true);
    await expect.poll(() => prisma.scoreEvent.count({ where: { registrationId, categoryId } })).toBe(2);
  });
});
