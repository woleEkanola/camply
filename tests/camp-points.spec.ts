import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Camp Points station", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);
  const ids: Record<string, string[]> = { users: [], campers: [], registrations: [], tribes: [], categories: [], sessions: [] };
  let campId = "";
  let campusId = "";
  let tribeId = "";
  let categoryName = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    campusId = ctx.campusId;
    const stamp = `${Date.now()}`;
    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Points Tribe ${stamp}` } });
    tribeId = tribe.id;
    ids.tribes.push(tribe.id);
    categoryName = `Helpful Behaviour ${stamp}`;
    const category = await prisma.scoreCategory.create({ data: {
      campId, key: `E2E_HELPFUL_${stamp}`, name: categoryName, description: "Helping another camper", defaultPoints: 10, kind: "MANUAL", sortOrder: -100,
    } });
    ids.categories.push(category.id);

    for (let index = 1; index <= 5; index++) {
      const parent = await prisma.user.create({ data: {
        email: `e2e-points-parent-${index}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId,
      } });
      ids.users.push(parent.id);
      const camper = await prisma.camper.create({ data: {
        name: `E2E Points Camper ${index} ${stamp}`, firstName: "E2E", lastName: `Points ${index}`,
        dateOfBirth: new Date(2013, 0, index), gender: index % 2 ? "FEMALE" : "MALE",
        userId: parent.id, organizationId: ctx.organizationId, homeCampusId: campusId,
      } });
      ids.campers.push(camper.id);
      const registration = await prisma.registration.create({ data: {
        camperId: camper.id, campId, campusId, tribeId, status: "CHECKED_IN",
        registrationNumber: `E2E-POINTS-${index}-${stamp}`, qrToken: `E2E-POINTS-QR-${index}-${stamp}`,
      } });
      ids.registrations.push(registration.id);
    }
  });

  test.afterAll(async () => {
    const sessions = await prisma.scoredSession.findMany({ where: { campId, categoryId: { in: ids.categories } }, select: { id: true } });
    ids.sessions.push(...sessions.map((row) => row.id));
    await prisma.sideEffect.deleteMany({ where: { type: { startsWith: "SCORE_" } } });
    await prisma.scoreEvent.deleteMany({ where: { registrationId: { in: ids.registrations } } });
    await prisma.leaderboardStat.deleteMany({ where: { campId, OR: [
      { subjectId: { in: ids.registrations } }, { subjectId: tribeId }, { subjectId: campusId },
    ] } });
    await prisma.scoredSession.deleteMany({ where: { id: { in: ids.sessions } } });
    await prisma.scoreCategory.deleteMany({ where: { id: { in: ids.categories } } });
    await prisma.registration.deleteMany({ where: { id: { in: ids.registrations } } });
    await prisma.camper.deleteMany({ where: { id: { in: ids.campers } } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.tribe.deleteMany({ where: { id: { in: ids.tribes } } });
  });

  test("admin awards five campers together, prevents duplicates, scans, and can undo", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/tribes");
    await page.getByLabel("Choose tribe").selectOption(tribeId);
    await page.getByRole("button", { name: "Points" }).click();
    await expect(page.getByTestId("camp-points-workspace")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: new RegExp(categoryName) }).click();
    await expect(page.getByTestId("dialog-panel")).toBeVisible();
    await page.getByRole("button", { name: "Open station" }).click();
    await expect(page.getByText("Active point station")).toBeVisible();

    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(5);
    for (let index = 0; index < 5; index++) await checkboxes.nth(index).check();
    await page.getByRole("button", { name: "Award 5" }).click();
    await expect(page.getByText("5 teenagers awarded.")).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => prisma.scoreEvent.count({ where: { categoryId: { in: ids.categories }, registrationId: { in: ids.registrations } } })).toBe(5);

    await checkboxes.first().check();
    await page.getByRole("button", { name: "Award 1" }).click();
    await expect(page.getByText("Already awarded in this session.")).toBeVisible();
    await page.getByRole("button", { name: "Scan QR" }).click();
    await expect(page.getByTestId("scanner-video")).toBeVisible();
    await page.getByRole("button", { name: /close/i }).click();
    await page.getByRole("button", { name: "Undo last" }).click();
    await expect(page.getByText("Last award reversed.")).toBeVisible();
    await expect.poll(async () => (await prisma.scoreEvent.findMany({ where: { registrationId: ids.registrations[4] } })).reduce((sum, row) => sum + row.points, 0)).toBe(0);
  });
});
