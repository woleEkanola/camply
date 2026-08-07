import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, prisma } from "./helpers";

/**
 * PR 7 — the tribe detail page (`tribeDetail` existed in the router since
 * PR3, but had no page until now). Seeds real fixture data across every
 * section — a teacher, a camper, a manual award, a penalty, a session-tied
 * score, and an achievement — and asserts all 12 spec sections render.
 */
test.describe("Leaderboard tribe detail page (PR 7)", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const teacherEmail = `e2e-tribedetail-teacher-${stamp}@camply.test`;
  const camperEmail = `e2e-tribedetail-parent-${stamp}@camply.test`;

  let campId: string;
  let campusId: string;
  let tribeId: string;
  let staffId: string;
  let registrationId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    campusId = ctx.campusId;

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Detail Tribe ${stamp}`, color: "#0ea5e9", motto: "E2E Motto" } });
    tribeId = tribe.id;

    const teacherUser = await prisma.user.create({
      data: { email: teacherEmail, password: "unused", role: "TEACHER", organizationId: ctx.organizationId },
    });
    const staff = await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId: ctx.organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E",
        lastName: "DetailTeacher",
        phone: "+1-555-0904",
        email: teacherEmail,
        approvedAt: new Date(),
        assignedTribeId: tribeId,
      },
    });
    staffId = staff.id;

    const parentUser = await prisma.user.create({
      data: { email: camperEmail, password: "x", role: "PARENT", organizationId: ctx.organizationId },
    });
    const camper = await prisma.camper.create({
      data: {
        name: "E2E Detail Camper",
        firstName: "E2E",
        lastName: "DetailCamper",
        dateOfBirth: new Date(2013, 5, 1),
        gender: "MALE",
        userId: parentUser.id,
        organizationId: ctx.organizationId,
        homeCampusId: campusId,
      },
    });
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, tribeId, status: "APPROVED" },
    });
    registrationId = registration.id;

    const session = await prisma.scoredSession.create({
      data: { campId, name: `E2E Detail Session ${stamp}`, date: new Date(), startsAt: new Date(), categoryId: "seed-cat-attendance" },
    });
    sessionId = session.id;

    const { appRouter } = await import("../src/server/api/root");
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
    });

    // Manual award.
    await caller.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribeId, categoryId: "seed-cat-cleaning", points: 15, reason: "E2E manual award" });
    // Penalty.
    await caller.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribeId, categoryId: "seed-cat-penalty", points: -10, reason: "E2E penalty" });
    // Session-tied score.
    await prisma.scoreEvent.create({
      data: {
        campId,
        tribeId,
        categoryId: "seed-cat-attendance",
        scoredSessionId: sessionId,
        points: 10,
        source: "AUTO",
        occurredAt: new Date(),
        day: new Date(),
      },
    });
    // Achievement.
    await prisma.achievementAward.create({ data: { definitionId: "seed-ach-perfect-attendance", campId, subjectKey: `T:${tribeId}` } });

    await prisma.$transaction(async (tx) => {
      const { rebuildLeaderboard } = await import("../src/server/leaderboard/aggregate");
      await rebuildLeaderboard(tx as any, campId);
    });
  });

  test.afterAll(async () => {
    await prisma.achievementAward.deleteMany({ where: { subjectKey: `T:${tribeId}` } });
    await prisma.scoreEvent.deleteMany({ where: { tribeId } });
    await prisma.leaderboardStat.deleteMany({ where: { subjectId: { in: [tribeId, registrationId] } } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { name: "E2E Detail Camper" } });
    await prisma.scoredSession.deleteMany({ where: { id: sessionId } });
    await prisma.tribe.deleteMany({ where: { id: tribeId } });
    await prisma.staffProfile.deleteMany({ where: { id: staffId } });
    await prisma.user.deleteMany({ where: { email: { in: [teacherEmail, camperEmail] } } });
  });

  test("renders all 12 detail sections with real fixture data", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto(`/leaderboard/tribe/${tribeId}`);

    await expect(page.getByRole("heading", { name: `${await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } }).then((t) => t.name)} Tribe` })).toBeVisible();

    // Overview
    await expect(page.getByText("15 pts", { exact: true })).toBeVisible(); // 15 (manual) - 10 (penalty) + 10 (session) = 15

    // Teacher(s)
    await expect(page.getByRole("heading", { name: "Teacher(s)" })).toBeVisible();
    await expect(page.getByText("E2E DetailTeacher")).toBeVisible();

    // Campers
    await expect(page.getByRole("heading", { name: /Campers \(\d+\)/ })).toBeVisible();
    await expect(page.getByText("E2E Detail Camper")).toBeVisible();

    // Statistics (rendered as StatCards)
    await expect(page.getByText("Campers Present")).toBeVisible();

    // Achievements
    await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
    await expect(page.getByText("Perfect Attendance")).toBeVisible();

    // Score Timeline
    await expect(page.getByRole("heading", { name: "Score Timeline" })).toBeVisible();

    // Session performance
    await expect(page.getByRole("heading", { name: "Session Performance" })).toBeVisible();
    await expect(page.getByText(`E2E Detail Session ${stamp}`)).toBeVisible();

    // Manual awards — scoped to the Card's own div (.rounded-lg), not an
    // outer wrapper, since Recent Activity also mentions "Cleaning" in its
    // own "Cleaning — <date>" entry further down the same page.
    const manualAwardsCard = page.locator("div.rounded-lg", { has: page.getByRole("heading", { name: "Manual Awards" }) });
    await expect(manualAwardsCard).toBeVisible();
    await expect(manualAwardsCard.getByText("Cleaning", { exact: true })).toBeVisible();

    // Penalties
    const penaltiesCard = page.locator("div.rounded-lg", { has: page.getByRole("heading", { name: "Penalties" }) });
    await expect(penaltiesCard).toBeVisible();
    await expect(penaltiesCard.getByText("Penalty", { exact: true })).toBeVisible();

    // Today's breakdown
    await expect(page.getByRole("heading", { name: "Today's Breakdown" })).toBeVisible();

    // Recent activity
    await expect(page.getByRole("heading", { name: "Recent Activity" })).toBeVisible();
  });

  test("View Detail link from the Tribes tab reaches the same page", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard");
    await page.getByRole("tab", { name: "Tribes" }).click();

    const card = page.getByTestId(`tribe-card-${tribeId}`);
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: "View Detail" }).click();
    await expect(page).toHaveURL(new RegExp(`/leaderboard/tribe/${tribeId}$`));
  });
});
