import { test, expect } from "@playwright/test";
import { loginWithPassword, loginWithOtp, getFixtureOrgContext, prisma } from "./helpers";

/**
 * PR 9 — the camper and staff detail pages (procedures existed since PR7 but
 * had no routes), row-click navigation into them from the Campers/Teachers
 * tabs, the Overview tab's raw-cuid display-name bug, and the enriched
 * parent "My Child" card.
 */
test.describe("Leaderboard detail pages (PR 9)", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const teacherEmail = `e2e-detail-teacher-${stamp}@camply.test`;
  const parentEmail = `e2e-detail-parent-${stamp}@camply.test`;
  const camperName = `E2E Detail Kid ${stamp}`;
  const teacherLast = `Detail${stamp}`;

  let campId: string;
  let campusId: string;
  let organizationId: string;
  let tribeId: string;
  let staffId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    campusId = ctx.campusId;
    organizationId = ctx.organizationId;

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Detail Tribe ${stamp}`, color: "#0ea5e9" } });
    tribeId = tribe.id;

    const teacherUser = await prisma.user.create({
      data: { email: teacherEmail, password: "unused", role: "TEACHER", organizationId },
    });
    const staff = await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E",
        lastName: teacherLast,
        phone: "+1-555-0905",
        email: teacherEmail,
        approvedAt: new Date(),
        assignedTribeId: tribeId,
      },
    });
    staffId = staff.id;

    const parentUser = await prisma.user.create({
      data: { email: parentEmail, password: "unused", role: "PARENT", organizationId },
    });
    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "E2E",
        lastName: `Kid${stamp}`,
        dateOfBirth: new Date(2013, 5, 1),
        gender: "MALE",
        userId: parentUser.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, tribeId, status: "APPROVED" },
    });
    registrationId = registration.id;

    const { appRouter } = await import("../src/server/api/root");
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
    });
    await caller.leaderboard.award({ campId, subjectType: "CAMPER", subjectId: registrationId, categoryId: "seed-cat-cleaning", points: 42, reason: `E2E camper detail ${stamp}` });
    await caller.leaderboard.award({ campId, subjectType: "STAFF", subjectId: staffId, categoryId: "seed-cat-leadership", points: 31, reason: `E2E staff detail ${stamp}` });

    await prisma.$transaction(async (tx) => {
      const { rebuildLeaderboard } = await import("../src/server/leaderboard/aggregate");
      await rebuildLeaderboard(tx as any, campId);
    });
  });

  test.afterAll(async () => {
    await prisma.achievementAward.deleteMany({ where: { subjectKey: { in: [`C:${registrationId}`, `S:${staffId}`, `T:${tribeId}`] } } });
    await prisma.scoreEvent.deleteMany({ where: { campId, OR: [{ registrationId }, { staffProfileId: staffId }, { tribeId }] } });
    await prisma.leaderboardStat.deleteMany({ where: { subjectId: { in: [registrationId, staffId, tribeId] } } });
    await prisma.auditLog.deleteMany({ where: { reason: { in: [`E2E camper detail ${stamp}`, `E2E staff detail ${stamp}`] } } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { name: camperName } });
    await prisma.tribe.deleteMany({ where: { id: tribeId } });
    await prisma.staffProfile.deleteMany({ where: { id: staffId } });
    await prisma.user.deleteMany({ where: { email: { in: [teacherEmail, parentEmail] } } });
  });

  test("Overview shows real names for top campers and teachers, not raw ids", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard");

    // The regression this guards: these lists used to render the raw
    // `subjectId` cuid as the display name.
    await expect(page.getByRole("link", { name: camperName })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: `E2E ${teacherLast}` })).toBeVisible();
    await expect(page.getByText(registrationId)).not.toBeVisible();
    await expect(page.getByText(staffId)).not.toBeVisible();
  });

  test("camper detail page renders from a Campers tab row click", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard");
    await page.getByRole("tab", { name: "Campers" }).click();

    // Table dual-renders desktop <table> + mobile card list simultaneously —
    // scope to the table role so the click isn't ambiguous.
    await page.getByRole("table").getByRole("cell", { name: camperName }).click();

    await expect(page).toHaveURL(new RegExp(`/leaderboard/camper/${registrationId}$`), { timeout: 15000 });
    await expect(page.getByRole("heading", { name: camperName })).toBeVisible();
    // `exact` matters: TrendChart's single-data-point fallback renders its own
    // "… Aug 8: 42 pts" card, so a substring match is ambiguous.
    await expect(page.getByText("42 pts", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Attendance & Promptness" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Score Timeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent Activity" })).toBeVisible();
  });

  test("staff detail page renders from a Teachers tab row click, including the composite", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard");
    await page.getByRole("tab", { name: "Teachers" }).click();

    await page.getByRole("table").getByRole("cell", { name: `E2E ${teacherLast}` }).click();

    await expect(page).toHaveURL(new RegExp(`/leaderboard/staff/${staffId}$`), { timeout: 15000 });
    await expect(page.getByRole("heading", { name: `E2E ${teacherLast}` })).toBeVisible();
    await expect(page.getByText("31 pts", { exact: true })).toBeVisible();
    await expect(page.getByText("Teacher Score")).toBeVisible();
  });

  test("a parent's My Child card shows the enriched stats and links to the camper page", async ({ page }) => {
    await loginWithOtp(page, parentEmail);
    await page.waitForURL(/\/dashboard/, { timeout: 45000 });
    await page.goto("/leaderboard");

    const card = page.locator("div.rounded-lg", { has: page.getByText("My Child", { exact: true }) }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.getByRole("heading", { name: camperName })).toBeVisible();
    await expect(card.getByText("42")).toBeVisible();

    await card.getByRole("link", { name: "View Full Progress" }).click();
    await expect(page).toHaveURL(new RegExp(`/leaderboard/camper/${registrationId}$`), { timeout: 15000 });
  });
});
