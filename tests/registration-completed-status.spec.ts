import { test, expect } from "@playwright/test";
import { loginWithPassword, loginWithOtp, getFixtureOrgContext, prisma } from "./helpers";

/**
 * PR 14 — `Registration.status = COMPLETED`. The enum value, the
 * `CHECKED_IN → COMPLETED` transition, and the parent-facing "completed camp"
 * screen have all existed for a long time, but nothing ever wrote the status,
 * so none of it was reachable. These tests exercise the paths that were dead.
 */
test.describe("Registration COMPLETED status (PR 14)", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const parentEmail = `e2e-completed-parent-${stamp}@camply.test`;
  const camperName = `E2E Completed Kid ${stamp}`;

  let campId: string;
  let campusId: string;
  let organizationId: string;
  let registrationId: string;
  let camperId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    campusId = ctx.campusId;
    organizationId = ctx.organizationId;

    const parentUser = await prisma.user.create({
      data: { email: parentEmail, password: "unused", role: "PARENT", organizationId },
    });
    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "E2E",
        lastName: `Completed${stamp}`,
        dateOfBirth: new Date(2013, 5, 1),
        gender: "MALE",
        userId: parentUser.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    // CHECKED_IN is the only status that can legally reach COMPLETED.
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, status: "CHECKED_IN", checkedInAt: new Date() },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { registrationId } });
    await prisma.scoreEvent.deleteMany({ where: { registrationId } });
    await prisma.leaderboardStat.deleteMany({ where: { subjectId: registrationId } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { email: parentEmail } });
  });

  test("an admin marks a checked-in camper completed from the status dialog", async ({ page }) => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const { appRouter } = await import("../src/server/api/root");
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
    });

    // Drive the same procedure the StatusDialog's "Mark Completed" option calls.
    await caller.registration.transitionWithOptions({ registrationId, action: "COMPLETE", sendEmail: false });

    const after = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(after.status).toBe("COMPLETED");

    const audit = await prisma.auditLog.findFirst({ where: { registrationId, action: "REGISTRATION_COMPLETED" } });
    expect(audit).not.toBeNull();

    // exitedCampCount counts COMPLETED registrations and could only ever
    // return 0 before this PR, since nothing wrote the status.
    const stats = await caller.camper.getAdminListStats({ organizationId, campId });
    expect((stats as any).exitedCampCount).toBeGreaterThan(0);

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await expect(page.getByText(camperName).first()).toBeVisible({ timeout: 20000 });
  });

  test("completing again is rejected as an illegal transition, not silently accepted", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const { appRouter } = await import("../src/server/api/root");
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
    });

    // COMPLETED -> COMPLETED is not in the transition map.
    await expect(
      caller.registration.transitionWithOptions({ registrationId, action: "COMPLETE", sendEmail: false })
    ).rejects.toThrow();

    const audits = await prisma.auditLog.count({ where: { registrationId, action: "REGISTRATION_COMPLETED" } });
    expect(audits).toBe(1);
  });

  test("the parent sees the completed-camp state that was previously unreachable", async ({ page }) => {
    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(reg.status).toBe("COMPLETED");

    await loginWithOtp(page, parentEmail);
    await page.waitForURL(/\/dashboard/, { timeout: 45000 });
    await page.goto(`/dashboard/register/${registrationId}`);

    await expect(page.getByText("This camper completed camp.")).toBeVisible({ timeout: 20000 });
  });
});
