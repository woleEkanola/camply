import { test, expect } from "@playwright/test";
import { hashPassword } from "../src/lib/auth";
import { getFixtureOrgContext, loginWithPassword, prisma } from "./helpers";

test.describe("Tribe award points flow", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let campId = "";
  let tribeId = "";
  let teacherUserId = "";
  let teacherProfileId = "";
  let category1Id = "";
  let category2Id = "";
  let camper1UserId = "";
  let camper1Id = "";
  let registration1Id = "";
  let camper2UserId = "";
  let camper2Id = "";
  let registration2Id = "";
  let teacherEmail = "";
  let camper1Name = "";
  let camper2Name = "";
  let category1Name = "";
  let category2Name = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    const stamp = Date.now();
    teacherEmail = `award-flow-teacher-${stamp}@camply.test`;
    camper1Name = `Award Flow Camper A ${stamp}`;
    camper2Name = `Award Flow Camper B ${stamp}`;
    category1Name = `Good Deed ${stamp}`;
    category2Name = `Helper ${stamp}`;

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Award Flow Tribe ${stamp}`, color: "#059669" } });
    tribeId = tribe.id;

    const category1 = await prisma.scoreCategory.create({ data: {
      campId, key: `E2E_GOOD_DEED_${stamp}`, name: category1Name, description: "Caught doing good", defaultPoints: 5, kind: "MANUAL", sortOrder: -100,
    } });
    category1Id = category1.id;
    const category2 = await prisma.scoreCategory.create({ data: {
      campId, key: `E2E_HELPER_${stamp}`, name: category2Name, description: "Helped set up an activity", defaultPoints: 8, kind: "MANUAL", sortOrder: -99,
    } });
    category2Id = category2.id;

    const teacher = await prisma.user.create({ data: { email: teacherEmail, password: await hashPassword("password123"), role: "TEACHER", organizationId: ctx.organizationId } });
    teacherUserId = teacher.id;
    const profile = await prisma.staffProfile.create({ data: { userId: teacher.id, organizationId: ctx.organizationId, campId, type: "TEACHER", status: "APPROVED", assignedTribeId: tribe.id, firstName: "Award", lastName: "Flow", gender: "MALE", phone: "08000000009", email: teacherEmail } });
    teacherProfileId = profile.id;

    const parent1 = await prisma.user.create({ data: { email: `award-flow-camper-a-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    camper1UserId = parent1.id;
    const camper1 = await prisma.camper.create({ data: { name: camper1Name, gender: "MALE", userId: parent1.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
    camper1Id = camper1.id;
    const registration1 = await prisma.registration.create({ data: { camperId: camper1.id, campId, campusId: ctx.campusId, tribeId: tribe.id, status: "APPROVED", registrationNumber: `AWARDFLOW-A-${stamp}` } });
    registration1Id = registration1.id;

    const parent2 = await prisma.user.create({ data: { email: `award-flow-camper-b-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    camper2UserId = parent2.id;
    const camper2 = await prisma.camper.create({ data: { name: camper2Name, gender: "FEMALE", userId: parent2.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
    camper2Id = camper2.id;
    const registration2 = await prisma.registration.create({ data: { camperId: camper2.id, campId, campusId: ctx.campusId, tribeId: tribe.id, status: "APPROVED", registrationNumber: `AWARDFLOW-B-${stamp}` } });
    registration2Id = registration2.id;
  });

  test.afterAll(async () => {
    const sessions = await prisma.scoredSession.findMany({ where: { campId, categoryId: { in: [category1Id, category2Id] } }, select: { id: true } });
    await prisma.sideEffect.deleteMany({ where: { type: { startsWith: "SCORE_" } } });
    await prisma.scoreEvent.deleteMany({ where: { registrationId: { in: [registration1Id, registration2Id] } } });
    await prisma.leaderboardStat.deleteMany({ where: { OR: [{ subjectId: registration1Id }, { subjectId: registration2Id }, { subjectId: tribeId }] } });
    await prisma.scoredSession.deleteMany({ where: { id: { in: sessions.map((row) => row.id) } } });
    await prisma.scoreCategory.deleteMany({ where: { id: { in: [category1Id, category2Id] } } });
    await prisma.registration.deleteMany({ where: { id: { in: [registration1Id, registration2Id] } } });
    await prisma.camper.deleteMany({ where: { id: { in: [camper1Id, camper2Id] } } });
    if (teacherProfileId) await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: [teacherUserId, camper1UserId, camper2UserId].filter(Boolean) } } });
    if (tribeId) await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  test("Campers is the default tab, and the scan-first award flow identifies, then asks why, awards under two categories, undoes, and finishes", async ({ page }) => {
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher/tribe");

    const hub = page.getByTestId("tribe-hub");
    await expect(hub).toBeVisible({ timeout: 15_000 });
    await expect(hub.getByText(camper1Name)).toBeVisible();
    const tabButtons = hub.getByRole("button", { name: /^(Campers|Overview|Teachers|Attendance|Points|Points guide)$/ });
    await expect(tabButtons.first()).toHaveText("Campers");

    // Scan-first: the camera/search UI is visible the instant the dialog
    // opens — no category step comes first.
    await page.getByTestId("award-points-button").click();
    const flow = page.getByTestId("award-points-flow");
    await expect(flow).toBeVisible();
    await expect(flow.getByPlaceholder(/search name/i)).toBeVisible();
    await expect(flow.getByText(category1Name)).not.toBeVisible();

    await flow.getByPlaceholder(/search name/i).fill(camper1Name);
    await flow.getByRole("button", { name: "Find" }).click();

    // Confirm step shows who was matched, then the category pills.
    await expect(flow.getByText(camper1Name)).toBeVisible({ timeout: 10_000 });
    await expect(flow.getByRole("button", { name: new RegExp(category1Name) })).toBeVisible();

    // An ordinary teacher gets no +/- stepper.
    await flow.getByRole("button", { name: new RegExp(category1Name) }).click();
    await expect(flow.getByTestId("points-stepper")).toHaveCount(0);

    // Nothing is written until the explicit Award tap.
    expect(await prisma.scoreEvent.count({ where: { registrationId: registration1Id } })).toBe(0);
    await flow.getByTestId("award-confirm").click();
    await expect(flow.getByTestId("award-count")).toHaveText(/1 awarded/);
    await expect.poll(() => prisma.scoreEvent.count({ where: { registrationId: registration1Id, categoryId: category1Id } })).toBe(1);

    // A second person under a DIFFERENT category proves per-category batch caching.
    await flow.getByPlaceholder(/search name/i).fill(camper2Name);
    await flow.getByRole("button", { name: "Find" }).click();
    await expect(flow.getByText(camper2Name)).toBeVisible({ timeout: 10_000 });
    await flow.getByRole("button", { name: new RegExp(category2Name) }).click();
    await flow.getByTestId("award-confirm").click();
    await expect(flow.getByTestId("award-count")).toHaveText(/2 awarded/);
    await expect.poll(() => prisma.scoreEvent.count({ where: { registrationId: registration2Id, categoryId: category2Id } })).toBe(1);

    await flow.getByRole("button", { name: "Undo last" }).click();
    await expect.poll(async () => {
      const rows = await prisma.scoreEvent.findMany({ where: { registrationId: registration2Id, categoryId: category2Id } });
      return rows.reduce((sum, row) => sum + row.points, 0);
    }).toBe(0);

    await flow.getByRole("button", { name: "Finish" }).click();
    await expect(flow).toBeHidden();
    const sessions = await prisma.scoredSession.findMany({ where: { campId, categoryId: { in: [category1Id, category2Id] } } });
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.every((session) => session.status === "CLOSED")).toBe(true);
  });

  test("an admin gets the +/- stepper and can adjust points before confirming", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/tribes");
    await page.getByLabel("Choose tribe").selectOption(tribeId);
    await page.getByTestId("award-points-button").click();

    const flow = page.getByTestId("award-points-flow");
    await expect(flow).toBeVisible();
    // Admin is unscoped, so the flow's own scope picker appears above the
    // camera — pick the tribe before the camera/search UI unlocks.
    await flow.getByLabel("Tribe").selectOption(tribeId);
    await flow.getByPlaceholder(/search name/i).fill(camper1Name);
    await flow.getByRole("button", { name: "Find" }).click();
    await expect(flow.getByText(camper1Name)).toBeVisible({ timeout: 10_000 });

    await flow.getByRole("button", { name: new RegExp(category1Name) }).click();
    const stepper = flow.getByTestId("points-stepper");
    await expect(stepper).toBeVisible();
    await stepper.getByLabel("Increase points").click();
    await stepper.getByLabel("Increase points").click();

    await flow.getByTestId("award-confirm").click();
    await expect(flow.getByTestId("award-count")).toHaveText(/1 awarded/);
    await expect.poll(async () => {
      const event = await prisma.scoreEvent.findFirst({ where: { registrationId: registration1Id, categoryId: category1Id }, orderBy: { occurredAt: "desc" } });
      return event?.points;
    }).toBe(7); // category default 5, bumped +2 via the stepper
  });
});
