import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Covers the Part B duplicate-teacher-registration cleanup flow: the
 * StaffDuplicatesPanel banner on /admin/teachers, the review dialog's
 * "Same phone" signal, the merge dialog's ID-card-retirement warning and
 * required acknowledgement, and the actual merge outcome (points combined,
 * source soft-deleted, its qrToken cleared, the losing login account left
 * untouched). See [[project_organogram_camp_command_overhaul]] for the
 * bug this cleans up after (registration route race — tests/
 * staff-register-duplicate-race.spec.ts covers the prevention side).
 */
test.describe("Staff duplicates: review and merge", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let sourceStaffId: string;
  let targetStaffId: string;
  const emails: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const sourceEmail = `e2e-dupe-source-${stamp}@camply.test`;
    const targetEmail = `e2e-dupe-target-${stamp}@camply.test`;
    emails.push(sourceEmail, targetEmail);

    const sourceUser = await prisma.user.create({ data: { email: sourceEmail, password: "x", role: "TEACHER", organizationId, homeCampusId: campusId } });
    const targetUser = await prisma.user.create({ data: { email: targetEmail, password: "x", role: "TEACHER", organizationId, homeCampusId: campusId } });

    // Same phone number, two different formats — the "Same phone" signal.
    const source = await prisma.staffProfile.create({
      data: {
        userId: sourceUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: `E2EDupe${stamp}`, lastName: "Teacher", phone: "08033334444", email: sourceEmail,
        preferredCampusId: campusId, qrToken: `STF-e2edupe-source-${stamp}`,
      },
    });
    const target = await prisma.staffProfile.create({
      data: {
        userId: targetUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: `E2EDupe${stamp}`, lastName: "Teacher", phone: "+2348033334444", email: targetEmail,
        preferredCampusId: campusId, qrToken: `STF-e2edupe-target-${stamp}`,
      },
    });
    sourceStaffId = source.id;
    targetStaffId = target.id;

    await prisma.scoreEvent.create({
      data: { campId, staffProfileId: source.id, categoryId: "attendance", points: 30, source: "MANUAL", day: new Date("2026-08-05") },
    });
    await prisma.scoreEvent.create({
      data: { campId, staffProfileId: target.id, categoryId: "attendance", points: 10, source: "MANUAL", day: new Date("2026-08-05") },
    });
    await prisma.leaderboardStat.create({ data: { campId, subjectType: "STAFF", subjectId: source.id, day: null, totalPoints: 30 } });
    await prisma.leaderboardStat.create({ data: { campId, subjectType: "STAFF", subjectId: target.id, day: null, totalPoints: 10 } });
  });

  test.afterAll(async () => {
    await prisma.scoreEvent.deleteMany({ where: { campId, staffProfileId: { in: [sourceStaffId, targetStaffId] } } });
    await prisma.leaderboardStat.deleteMany({ where: { campId, subjectType: "STAFF", subjectId: { in: [sourceStaffId, targetStaffId] } } });
    await prisma.staffProfile.deleteMany({ where: { id: { in: [sourceStaffId, targetStaffId] } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  test("flags the pair, warns about the ID card, and merging combines points and clears the source's card", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");

    await expect(page.getByTestId("staff-duplicates-banner")).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("staff-duplicates-integrity-alarm")).toHaveCount(0);

    await page.getByTestId("staff-duplicates-banner").getByRole("button", { name: "Review" }).click();
    const reviewDialog = page.getByTestId("dialog-panel").last();
    await expect(reviewDialog).toBeVisible();

    const ourGroup = reviewDialog.locator(`[data-testid^="staff-duplicate-group-"]`, { hasText: `E2EDupe${stamp}` });
    await expect(ourGroup.getByText("Same phone")).toBeVisible();
    await ourGroup.getByRole("button", { name: "Merge…" }).click();

    const mergeDialog = page.getByTestId("staff-merge-dialog");
    await expect(mergeDialog).toBeVisible();

    await expect(mergeDialog.getByTestId("staff-merge-preview")).toBeVisible({ timeout: 10000 });
    await expect(mergeDialog.getByText(/card will be retired/i)).toBeVisible();

    const mergeButton = mergeDialog.getByRole("button", { name: "Merge", exact: true });
    await expect(mergeButton).toBeDisabled();
    await mergeDialog.locator("#staff-merge-ack").check();
    await expect(mergeButton).toBeEnabled();
    await mergeButton.click();

    await expect(mergeDialog).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(async () => prisma.staffProfile.count({ where: { id: { in: [sourceStaffId, targetStaffId] }, deletedAt: null } }), { timeout: 10000 })
      .toBe(1);

    const survivors = await prisma.staffProfile.findMany({ where: { id: { in: [sourceStaffId, targetStaffId] } } });
    const survivor = survivors.find((s) => !s.deletedAt)!;
    const merged = survivors.find((s) => s.deletedAt)!;
    expect(merged.qrToken).toBeNull();
    expect(survivor.qrToken).not.toBeNull();

    const survivorStat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: survivor.id, day: null } });
    expect(survivorStat?.totalPoints).toBe(40);

    // The losing login account stays fully active per product decision.
    const mergedUser = await prisma.user.findUniqueOrThrow({ where: { id: merged.userId } });
    expect(mergedUser.active).toBe(true);
    expect(mergedUser.deletedAt).toBeNull();
  });
});
