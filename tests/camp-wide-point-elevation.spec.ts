import { test, expect } from "@playwright/test";
import { hashPassword } from "../src/lib/auth";
import { getFixtureOrgContext, loginWithPassword, prisma, drawerPanel } from "./helpers";

test.describe("Camp-wide point award elevation", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let campId = "";
  let tribeAId = "";
  let tribeBId = "";
  let teacherUserId = "";
  let teacherProfileId = "";
  let camperAUserId = "";
  let camperAId = "";
  let registrationAId = "";
  let camperBUserId = "";
  let camperBId = "";
  let registrationBId = "";
  let categoryId = "";
  let teacherEmail = "";
  let camperBName = "";
  let categoryName = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    const stamp = Date.now();
    teacherEmail = `elevation-teacher-${stamp}@camply.test`;
    camperBName = `Elevation Camper B ${stamp}`;
    categoryName = `Kindness ${stamp}`;

    const tribeA = await prisma.tribe.create({ data: { campId, name: `E2E Elevation Tribe A ${stamp}`, color: "#2563EB" } });
    tribeAId = tribeA.id;
    const tribeB = await prisma.tribe.create({ data: { campId, name: `E2E Elevation Tribe B ${stamp}`, color: "#DB2777" } });
    tribeBId = tribeB.id;

    const category = await prisma.scoreCategory.create({ data: {
      campId, key: `E2E_KINDNESS_${stamp}`, name: categoryName, description: "Camp-wide kindness", defaultPoints: 5, kind: "MANUAL", sortOrder: -100,
    } });
    categoryId = category.id;

    const teacher = await prisma.user.create({ data: { email: teacherEmail, password: await hashPassword("password123"), role: "TEACHER", organizationId: ctx.organizationId } });
    teacherUserId = teacher.id;
    const profile = await prisma.staffProfile.create({ data: { userId: teacher.id, organizationId: ctx.organizationId, campId, type: "TEACHER", status: "APPROVED", assignedTribeId: tribeA.id, firstName: "Elevation", lastName: "Teacher", gender: "MALE", phone: "08000000010", email: teacherEmail } });
    teacherProfileId = profile.id;

    const parentA = await prisma.user.create({ data: { email: `elevation-camper-a-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    camperAUserId = parentA.id;
    const camperA = await prisma.camper.create({ data: { name: `Elevation Camper A ${stamp}`, gender: "MALE", userId: parentA.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
    camperAId = camperA.id;
    const registrationA = await prisma.registration.create({ data: { camperId: camperA.id, campId, campusId: ctx.campusId, tribeId: tribeA.id, status: "APPROVED", registrationNumber: `ELEV-A-${stamp}` } });
    registrationAId = registrationA.id;

    const parentB = await prisma.user.create({ data: { email: `elevation-camper-b-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    camperBUserId = parentB.id;
    const camperB = await prisma.camper.create({ data: { name: camperBName, gender: "FEMALE", userId: parentB.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
    camperBId = camperB.id;
    const registrationB = await prisma.registration.create({ data: { camperId: camperB.id, campId, campusId: ctx.campusId, tribeId: tribeB.id, status: "APPROVED", registrationNumber: `ELEV-B-${stamp}` } });
    registrationBId = registrationB.id;
  });

  test.afterAll(async () => {
    const sessions = await prisma.scoredSession.findMany({ where: { campId, categoryId }, select: { id: true } });
    await prisma.sideEffect.deleteMany({ where: { type: { startsWith: "SCORE_" } } });
    await prisma.scoreEvent.deleteMany({ where: { registrationId: { in: [registrationAId, registrationBId].filter(Boolean) } } });
    await prisma.leaderboardStat.deleteMany({ where: { OR: [{ subjectId: registrationAId }, { subjectId: registrationBId }, { subjectId: tribeAId }, { subjectId: tribeBId }] } });
    await prisma.scoredSession.deleteMany({ where: { id: { in: sessions.map((row) => row.id) } } });
    await prisma.scoreCategory.deleteMany({ where: { id: categoryId } });
    await prisma.registration.deleteMany({ where: { id: { in: [registrationAId, registrationBId].filter(Boolean) } } });
    await prisma.camper.deleteMany({ where: { id: { in: [camperAId, camperBId].filter(Boolean) } } });
    if (teacherProfileId) await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: [teacherUserId, camperAUserId, camperBUserId].filter(Boolean) } } });
    await prisma.tribe.deleteMany({ where: { id: { in: [tribeAId, tribeBId] } } });
  });

  test("a non-elevated teacher cannot award outside their tribe; camp-wide elevation unlocks it", async ({ page }) => {
    // Baseline: server rejects awarding tribe B's camper from a tribe-A-scoped session.
    await loginWithPassword(page, teacherEmail, "password123");
    const startRes = await page.request.post("/api/trpc/campPoints.startBatch", {
      data: { json: { campId, categoryId, tribeId: tribeAId, subjectAudience: "CAMPER" } },
    });
    expect(startRes.ok()).toBe(true);
    const batchId = (await startRes.json()).result?.data?.json?.id;
    expect(batchId).toBeTruthy();

    const awardRes = await page.request.post("/api/trpc/campPoints.award", {
      data: { json: { batchId, registrationIds: [registrationBId], entryMethod: "SELECT" } },
    });
    expect(awardRes.ok()).toBe(false);
    const awardBody = await awardRes.json();
    expect(awardBody.error?.json?.code).toBeTruthy();
    expect(await prisma.scoreEvent.count({ where: { registrationId: registrationBId } })).toBe(0);

    // Admin elevates the teacher to camp-wide via the real staff directory UI.
    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByTestId("directory-search-input").fill(teacherEmail);
    const results = page.getByTestId("directory-search-results");
    const staffRow = results.getByText(/Elevation Teacher/).first();
    await expect(staffRow).toBeVisible({ timeout: 10_000 });
    await staffRow.click();
    await expect(page.getByTestId("staff-profile-sheet")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "View full profile" }).click();
    const drawer = drawerPanel(page);
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    // The toggle lives on the drawer's "Assignment" tab, not the default "Profile" tab.
    await drawer.getByRole("tab", { name: "Assignment" }).click();
    // A controlled checkbox (checked={profile.canAwardCampWide}) only flips
    // visually after the mutation round-trips and refetches — .check()'s
    // built-in "did the state change" assertion races that, so click and
    // poll the DB instead of asserting the DOM checked state.
    await drawer.getByRole("checkbox", { name: /Award points camp-wide/i }).click();
    await expect.poll(() => prisma.staffProfile.findUnique({ where: { id: teacherProfileId } }).then((row) => row?.canAwardCampWide)).toBe(true);

    // Elevated teacher now reaches tribe B's camper through the tribe-A hub's
    // Award points flow, with the scope picker unlocked to "whole camp".
    await page.context().clearCookies();
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher/tribe");
    const hub = page.getByTestId("tribe-hub");
    await expect(hub).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("award-points-button")).toHaveText(/camp-wide/i);
    await page.getByTestId("award-points-button").click();

    const flow = page.getByTestId("award-points-flow");
    // Scan-first: the scope picker (visible because this teacher is now
    // camp-wide elevated) must be set to "whole camp" before the camera/
    // search UI unlocks — the category is chosen afterwards, on the
    // confirm step, once tribe B's camper has been identified.
    await flow.getByLabel("Award to").selectOption("CAMP");
    await flow.getByPlaceholder(/search name/i).fill(camperBName);
    await flow.getByRole("button", { name: "Find" }).click();
    await expect(flow.getByText(camperBName)).toBeVisible({ timeout: 10_000 });
    await flow.getByRole("button", { name: new RegExp(categoryName) }).click();
    await flow.getByTestId("award-confirm").click();
    await expect(flow.getByTestId("award-count")).toHaveText(/1 awarded/);

    await expect.poll(() => prisma.scoreEvent.count({ where: { registrationId: registrationBId, categoryId } })).toBe(1);
    const event = await prisma.scoreEvent.findFirst({ where: { registrationId: registrationBId, categoryId } });
    expect(event?.tribeId).toBe(tribeBId);
    expect(event?.createdById).toBe(teacherUserId);
  });
});
