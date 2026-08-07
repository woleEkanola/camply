import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithOtp, deleteStaffByEmail } from "./helpers";

/**
 * Camp Head grant — a TEACHER holding a Position flagged
 * `grantsManageCamp: true` gets into /leaderboard/admin the same as an org
 * admin (src/server/api/trpc/scoping.ts's assertCanManageCamp, surfaced to
 * the client via leaderboard.canManageCamp), while an ordinary TEACHER with
 * no such position is redirected back to /leaderboard.
 */
test.describe("Leaderboard admin — Camp Head grant", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const campHeadEmail = `e2e-camphead-${stamp}@camply.test`;
  const plainTeacherEmail = `e2e-plainteacher-${stamp}@camply.test`;

  let campId: string;
  let campHeadPositionId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;

    const campHeadUser = await prisma.user.create({
      data: { email: campHeadEmail, password: "unused", role: "TEACHER", organizationId: ctx.organizationId },
    });
    const campHeadStaff = await prisma.staffProfile.create({
      data: {
        userId: campHeadUser.id,
        organizationId: ctx.organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E",
        lastName: "CampHead",
        phone: "+1-555-0901",
        email: campHeadEmail,
        approvedAt: new Date(),
      },
    });

    const position = await prisma.position.create({
      data: { campId, name: `E2E Camp Director ${stamp}`, grantsManageCamp: true },
    });
    campHeadPositionId = position.id;
    await prisma.positionAssignment.create({
      data: { positionId: position.id, staffId: campHeadStaff.id, isCurrent: true },
    });

    const plainUser = await prisma.user.create({
      data: { email: plainTeacherEmail, password: "unused", role: "TEACHER", organizationId: ctx.organizationId },
    });
    await prisma.staffProfile.create({
      data: {
        userId: plainUser.id,
        organizationId: ctx.organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E",
        lastName: "PlainTeacher",
        phone: "+1-555-0902",
        email: plainTeacherEmail,
        approvedAt: new Date(),
      },
    });
  });

  test.afterAll(async () => {
    await prisma.positionAssignment.deleteMany({ where: { positionId: campHeadPositionId } });
    await prisma.position.delete({ where: { id: campHeadPositionId } });
    await deleteStaffByEmail(campHeadEmail);
    await deleteStaffByEmail(plainTeacherEmail);
  });

  test("a Camp Head can reach the leaderboard admin area", async ({ page }) => {
    await loginWithOtp(page, campHeadEmail);
    await page.waitForURL(/\/teacher/, { timeout: 45000 });

    await page.goto("/leaderboard/admin");
    await expect(page.getByRole("tab", { name: "Categories" })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/leaderboard\/admin/);
  });

  test("a plain teacher with no Camp Head grant is redirected away from admin", async ({ page }) => {
    await loginWithOtp(page, plainTeacherEmail);
    await page.waitForURL(/\/teacher/, { timeout: 45000 });

    await page.goto("/leaderboard/admin");
    await expect(page).toHaveURL(/\/leaderboard$/, { timeout: 15000 });
    await expect(page.getByRole("tab", { name: "Categories" })).not.toBeVisible();
  });
});
