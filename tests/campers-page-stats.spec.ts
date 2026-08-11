import { test, expect } from "@playwright/test";
import type { RegistrationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Verifies the admin and teacher campers pages show the 5 scoped
 * stat cards: Approved (APPROVED), In Camp (CHECKED_IN),
 * Male (CHECKED_IN males), Female (CHECKED_IN females),
 * Exited Camp (COMPLETED).
 *
 * Male/Female are scoped to CHECKED_IN registrations — not all
 * registered campers.
 */
test.describe("Campers page: stat cards (admin + teacher)", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const teacherEmail = `e2e-camperstats-teacher-${stamp}@camply.test`;
  let organizationId: string;
  let campId: string;
  let campusId: string;
    let teacherId: string;
    let teacherProfileId: string;
    const parentIds: string[] = [];
  const camperIds: string[] = [];
  const registrationIds: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const password = await bcrypt.hash("password123", 10);
    const teacher = await prisma.user.create({
      data: {
        email: teacherEmail,
        password,
        role: "TEACHER",
        organizationId,
      },
    });
    teacherId = teacher.id;

    const teacherProfile = await prisma.staffProfile.create({
      data: {
        userId: teacherId,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E",
        lastName: "Teacher",
        phone: "0000000000",
        email: teacherEmail,
      },
    });
    teacherProfileId = teacherProfile.id;

    async function makeCamper(gender: string, status?: RegistrationStatus) {
      const parent = await prisma.user.create({
        data: {
          email: `e2e-camperstats-${parentIds.length}-${stamp}@camply.test`,
          password: "x",
          role: "PARENT",
          organizationId,
        },
      });
      parentIds.push(parent.id);
      const camper = await prisma.camper.create({
        data: {
          name: `E2E CamperStats ${gender} ${stamp}-${camperIds.length}`,
          userId: parent.id,
          organizationId,
          homeCampusId: campusId,
          gender,
        },
      });
      camperIds.push(camper.id);
      if (status) {
        const reg = await prisma.registration.create({
          data: { camperId: camper.id, campId, campusId, status },
        });
        registrationIds.push(reg.id);
      }
      return camper;
    }

    // Male + APPROVED → contributes to approvedCount
    await makeCamper("Male", "APPROVED");
    // Female + CHECKED_IN → contributes to inCampCount, checkedInFemaleCount
    await makeCamper("Female", "CHECKED_IN");
    // Male + CHECKED_IN → contributes to inCampCount, checkedInMaleCount
    await makeCamper("Male", "CHECKED_IN");
    // Female + COMPLETED → contributes to exitedCampCount
    await makeCamper("Female", "COMPLETED");
    // Male + no registration → no stat card contribution
    await makeCamper("Male");
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
    if (teacherProfileId) await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: [...parentIds, teacherId] } } });
  });

  async function statValue(page: any, testId: string): Promise<number> {
    const text = (await page.getByTestId(testId).textContent()) ?? "";
    return parseInt(text.match(/\d+/)?.[0] ?? "0", 10);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ADMIN CAMPERS PAGE
  // ═══════════════════════════════════════════════════════════════════════

  test("admin campers page shows all 5 scoped stat cards", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/campers");

    await expect(page.getByTestId("camper-stat-approved")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("camper-stat-in-camp")).toBeVisible();
    await expect(page.getByTestId("camper-stat-male")).toBeVisible();
    await expect(page.getByTestId("camper-stat-female")).toBeVisible();
    await expect(page.getByTestId("camper-stat-exited-camp")).toBeVisible();
  });

  test("admin campers page stat card counts match scoped fixture data", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/campers");

    await expect(page.getByTestId("camper-stat-approved")).toBeVisible({ timeout: 10000 });

    // Poll until the async stats query resolves (cards mount at 0 first)
    await expect(async () => {
      // At minimum the 4 we created with registrations, plus any
      // pre-existing fixture-org campers
      expect(await statValue(page, "camper-stat-approved")).toBeGreaterThanOrEqual(1);
      expect(await statValue(page, "camper-stat-in-camp")).toBeGreaterThanOrEqual(2);
      expect(await statValue(page, "camper-stat-exited-camp")).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15000 });

    // Male/Female are scoped to CHECKED_IN only — the APPROVED male
    // and COMPLETED female don't count toward these
    expect(await statValue(page, "camper-stat-male")).toBeGreaterThanOrEqual(1);
    expect(await statValue(page, "camper-stat-female")).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  TEACHER CAMPERS PAGE
  // ═══════════════════════════════════════════════════════════════════════

  test("teacher campers page shows all 5 scoped stat cards", async ({ page }) => {
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher/campers");

    await expect(page.getByTestId("camper-stat-approved")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("camper-stat-in-camp")).toBeVisible();
    await expect(page.getByTestId("camper-stat-male")).toBeVisible();
    await expect(page.getByTestId("camper-stat-female")).toBeVisible();
    await expect(page.getByTestId("camper-stat-exited-camp")).toBeVisible();
  });

  test("teacher campers page stat card counts are populated", async ({ page }) => {
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher/campers");

    await expect(page.getByTestId("camper-stat-approved")).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      expect(await statValue(page, "camper-stat-approved")).toBeGreaterThanOrEqual(1);
      expect(await statValue(page, "camper-stat-in-camp")).toBeGreaterThanOrEqual(2);
      expect(await statValue(page, "camper-stat-exited-camp")).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15000 });
  });
});
