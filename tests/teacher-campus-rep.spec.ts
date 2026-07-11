import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithOtp, deleteStaffByEmail } from "./helpers";

/**
 * Exercises dual-role support: a TEACHER account can also hold Campus Rep
 * capability (granted via the Campus.reps relation, independent of their
 * primary `role`), while retaining their Teacher login/permissions/dashboard.
 * See src/server/api/trpc/scoping.ts's assertOrgAdminOrCampusRep and
 * src/server/auth/authOptions.ts's jwt callback.
 */
test.describe("Dual role: a Teacher can also be a Campus Rep", () => {
  test.describe.configure({ mode: "serial" });

  const teacherEmail = `e2e-teacher-rep-${Date.now()}@camply.test`;
  const otherCampusParentEmail = `e2e-other-campus-parent-${Date.now()}@camply.test`;

  let organizationId: string;
  let campId: string;
  let teacherUserId: string;
  let ownCampusId: string;
  let otherCampusId: string;
  let ownRegistrationId: string;
  let otherRegistrationId: string;
  let otherParentId: string;
  let otherCamperId: string;
  let tribeId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const ownCampus = await prisma.campus.create({
      data: { name: `E2E TeacherRep Campus ${Date.now()}`, slug: `e2e-teacherrep-campus-${Date.now()}`, address: "1 Rep St", city: "Testville", country: "Testland", organizationId },
    });
    ownCampusId = ownCampus.id;
    const otherCampus = await prisma.campus.create({
      data: { name: `E2E TeacherRep Other Campus ${Date.now()}`, slug: `e2e-teacherrep-other-${Date.now()}`, address: "1 Other St", city: "Testville", country: "Testland", organizationId },
    });
    otherCampusId = otherCampus.id;

    // A Teacher account, self-registered like any staff member — no password,
    // logs in via OTP — that is ALSO granted Campus Rep capability for ownCampus.
    const teacherUser = await prisma.user.create({
      data: { email: teacherEmail, password: "unused-otp-login", role: "TEACHER", organizationId, managedCampuses: { connect: { id: ownCampusId } } },
    });
    teacherUserId = teacherUser.id;
    await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: "E2E", lastName: "TeacherRep", phone: "+1-555-0800", email: teacherEmail, approvedAt: new Date(),
      },
    });

    const parent = await prisma.user.create({ data: { email: otherCampusParentEmail, password: "x", role: "PARENT", organizationId } });
    otherParentId = parent.id;
    const camper = await prisma.camper.create({ data: { name: "E2E TeacherRep Other Camper", userId: parent.id, organizationId, homeCampusId: otherCampusId } });
    otherCamperId = camper.id;

    const ownReg = await prisma.registration.create({
      data: { camperId: (await prisma.camper.create({ data: { name: "E2E TeacherRep Own Camper", userId: parent.id, organizationId, homeCampusId: ownCampusId } })).id, campId, campusId: ownCampusId, status: "APPROVED", registrationNumber: `E2E-TREP-OWN-${Date.now()}` },
    });
    ownRegistrationId = ownReg.id;
    const otherReg = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId: otherCampusId, status: "APPROVED", registrationNumber: `E2E-TREP-OTHER-${Date.now()}` },
    });
    otherRegistrationId = otherReg.id;

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E TeacherRep Tribe ${Date.now()}` } });
    tribeId = tribe.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: [ownRegistrationId, otherRegistrationId] } } });
    await prisma.tribe.deleteMany({ where: { id: tribeId } });
    await prisma.camper.deleteMany({ where: { OR: [{ id: otherCamperId }, { userId: otherParentId }] } });
    await prisma.user.deleteMany({ where: { id: otherParentId } });
    await prisma.campus.deleteMany({ where: { id: { in: [ownCampusId, otherCampusId] } } });
    await deleteStaffByEmail(teacherEmail);
  });

  test("a Teacher who is also a Campus Rep can act on their campus's registration but not another's, and keeps Teacher dashboard access", async ({ page }) => {
    await loginWithOtp(page, teacherEmail);
    await page.waitForURL(/\/teacher/, { timeout: 15000 });

    // Retains Teacher self-service access.
    await expect(page.getByRole("heading", { name: "Teacher Dashboard" })).toBeVisible({ timeout: 10000 });

    // Nav gained the Campus Rep's Registrations/Campers items on top of the Teacher nav.
    await expect(page.getByText("My Campus (Rep)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrations" })).toBeVisible();

    // Can assign a tribe on a registration in their own (rep) campus.
    const ok = await page.request.post("/api/trpc/tribe.assign?batch=1", {
      data: { "0": { json: { registrationId: ownRegistrationId, tribeId } } },
      headers: { "Content-Type": "application/json" },
    });
    expect(ok.ok()).toBe(true);
    const updatedOwn = await prisma.registration.findUniqueOrThrow({ where: { id: ownRegistrationId } });
    expect(updatedOwn.tribeId).toBe(tribeId);

    // Still FORBIDDEN from a campus they don't manage.
    const forbidden = await page.request.post("/api/trpc/tribe.assign?batch=1", {
      data: { "0": { json: { registrationId: otherRegistrationId, tribeId } } },
      headers: { "Content-Type": "application/json" },
    });
    expect(forbidden.status()).toBe(403);
    const unchangedOther = await prisma.registration.findUniqueOrThrow({ where: { id: otherRegistrationId } });
    expect(unchangedOther.tribeId).toBeNull();
  });
});
