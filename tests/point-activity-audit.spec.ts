import { test, expect } from "@playwright/test";
import { hashPassword } from "../src/lib/auth";
import { recordScoreEvent } from "../src/server/leaderboard/record";
import { getFixtureOrgContext, loginWithPassword, prisma } from "./helpers";

test.describe("Point activity audit page", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let campId = "";
  let tribeAId = "";
  let tribeBId = "";
  let category1Id = "";
  let category2Id = "";
  let teacher1UserId = "";
  let teacher1ProfileId = "";
  let teacher2UserId = "";
  let teacher2ProfileId = "";
  let camper1Id = "";
  let camper1UserId = "";
  let registration1Id = "";
  let camper2Id = "";
  let camper2UserId = "";
  let registration2Id = "";
  let category1Name = "";
  let category2Name = "";
  let camper1Name = "";
  let camper2Name = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    const stamp = Date.now();
    category1Name = `Audit Category 1 ${stamp}`;
    category2Name = `Audit Category 2 ${stamp}`;
    camper1Name = `Audit Camper A ${stamp}`;
    camper2Name = `Audit Camper B ${stamp}`;

    const tribeA = await prisma.tribe.create({ data: { campId, name: `E2E Audit Tribe A ${stamp}` } });
    tribeAId = tribeA.id;
    const tribeB = await prisma.tribe.create({ data: { campId, name: `E2E Audit Tribe B ${stamp}` } });
    tribeBId = tribeB.id;

    const category1 = await prisma.scoreCategory.create({ data: { campId, key: `E2E_AUDIT_1_${stamp}`, name: category1Name, defaultPoints: 10, kind: "MANUAL", sortOrder: -100 } });
    category1Id = category1.id;
    const category2 = await prisma.scoreCategory.create({ data: { campId, key: `E2E_AUDIT_2_${stamp}`, name: category2Name, defaultPoints: 15, kind: "MANUAL", sortOrder: -99 } });
    category2Id = category2.id;

    const teacher1 = await prisma.user.create({ data: { email: `audit-teacher-1-${stamp}@camply.test`, password: await hashPassword("password123"), role: "TEACHER", organizationId: ctx.organizationId, firstName: "Audit1", lastName: "Teacher" } });
    teacher1UserId = teacher1.id;
    const teacher1Profile = await prisma.staffProfile.create({ data: { userId: teacher1.id, organizationId: ctx.organizationId, campId, type: "TEACHER", status: "APPROVED", assignedTribeId: tribeA.id, firstName: "Audit1", lastName: "Teacher", gender: "MALE", phone: "08000000012", email: teacher1.email } });
    teacher1ProfileId = teacher1Profile.id;

    const teacher2 = await prisma.user.create({ data: { email: `audit-teacher-2-${stamp}@camply.test`, password: await hashPassword("password123"), role: "TEACHER", organizationId: ctx.organizationId, firstName: "Audit2", lastName: "Teacher" } });
    teacher2UserId = teacher2.id;
    const teacher2Profile = await prisma.staffProfile.create({ data: { userId: teacher2.id, organizationId: ctx.organizationId, campId, type: "TEACHER", status: "APPROVED", assignedTribeId: tribeB.id, firstName: "Audit2", lastName: "Teacher", gender: "FEMALE", phone: "08000000013", email: teacher2.email } });
    teacher2ProfileId = teacher2Profile.id;

    const parent1 = await prisma.user.create({ data: { email: `audit-camper-a-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    camper1UserId = parent1.id;
    const camper1 = await prisma.camper.create({ data: { name: camper1Name, gender: "MALE", userId: parent1.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
    camper1Id = camper1.id;
    const registration1 = await prisma.registration.create({ data: { camperId: camper1.id, campId, campusId: ctx.campusId, tribeId: tribeA.id, status: "APPROVED", registrationNumber: `AUDIT-A-${stamp}` } });
    registration1Id = registration1.id;

    const parent2 = await prisma.user.create({ data: { email: `audit-camper-b-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    camper2UserId = parent2.id;
    const camper2 = await prisma.camper.create({ data: { name: camper2Name, gender: "FEMALE", userId: parent2.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
    camper2Id = camper2.id;
    const registration2 = await prisma.registration.create({ data: { camperId: camper2.id, campId, campusId: ctx.campusId, tribeId: tribeB.id, status: "APPROVED", registrationNumber: `AUDIT-B-${stamp}` } });
    registration2Id = registration2.id;

    // Two awards by two different staff, under two different categories,
    // to two different campers — real writes through recordScoreEvent's
    // own contract (idempotencyKey), not a raw insert, so the admin page
    // exercises the actual data pointActivity reads.
    await recordScoreEvent({
      campId, tribeId: tribeA.id, registrationId: registration1.id, categoryId: category1.id, points: 10,
      reason: "Great teamwork", source: "MANUAL", createdById: teacher1.id, idempotencyKey: `e2e-audit-1-${stamp}`,
    });
    await recordScoreEvent({
      campId, tribeId: tribeB.id, registrationId: registration2.id, categoryId: category2.id, points: 15,
      reason: "Helped set up chairs", source: "MANUAL", createdById: teacher2.id, idempotencyKey: `e2e-audit-2-${stamp}`,
    });
  });

  test.afterAll(async () => {
    await prisma.sideEffect.deleteMany({ where: { type: { startsWith: "SCORE_" } } });
    await prisma.scoreEvent.deleteMany({ where: { registrationId: { in: [registration1Id, registration2Id] } } });
    await prisma.leaderboardStat.deleteMany({ where: { OR: [{ subjectId: registration1Id }, { subjectId: registration2Id }, { subjectId: tribeAId }, { subjectId: tribeBId }] } });
    await prisma.scoreCategory.deleteMany({ where: { id: { in: [category1Id, category2Id] } } });
    await prisma.registration.deleteMany({ where: { id: { in: [registration1Id, registration2Id] } } });
    await prisma.camper.deleteMany({ where: { id: { in: [camper1Id, camper2Id] } } });
    await prisma.staffProfile.deleteMany({ where: { id: { in: [teacher1ProfileId, teacher2ProfileId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [teacher1UserId, teacher2UserId, camper1UserId, camper2UserId].filter(Boolean) } } });
    await prisma.tribe.deleteMany({ where: { id: { in: [tribeAId, tribeBId] } } });
  });

  test("admin sees both awards with the correct awarder, category, and reason, and can filter by tribe and category", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin?tab=point-activity");

    const panel = page.getByTestId("point-activity-admin");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const row1 = panel.locator("tr").filter({ hasText: camper1Name });
    const row2 = panel.locator("tr").filter({ hasText: camper2Name });
    await expect(row1.first()).toContainText("Audit1 Teacher");
    await expect(row1.first()).toContainText(category1Name);
    await expect(row1.first()).toContainText("Great teamwork");
    await expect(row2.first()).toContainText("Audit2 Teacher");
    await expect(row2.first()).toContainText(category2Name);

    // Filter to tribe A: only camper A's row remains.
    await page.getByLabel("Tribe").selectOption(tribeAId);
    await expect(panel.getByText(camper1Name)).toBeVisible();
    await expect(panel.getByText(camper2Name)).not.toBeVisible();

    // Switch to tribe B + category 2: only camper B's row.
    await page.getByLabel("Tribe").selectOption(tribeBId);
    await page.getByLabel("Category").selectOption(category2Id);
    await expect(panel.getByText(camper2Name)).toBeVisible();
    await expect(panel.getByText(camper1Name)).not.toBeVisible();
  });
});
