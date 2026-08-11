import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail } from "./helpers";

/**
 * Staff (teacher/volunteer) camp ID cards — mirrors the camper card system
 * but with NO tribe requirement (the camper card's buildCampIdCardData
 * returns null without a tribe; buildStaffIdCardData deliberately does not,
 * since many teachers and all volunteers have no tribe assignment).
 */
test.describe("Staff ID cards", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const teacherEmail = `e2e-staffcard-teacher-${stamp}@camply.test`;
  const volunteerEmail = `e2e-staffcard-volunteer-${stamp}@camply.test`;

  let organizationId: string;
  let campId: string;
  let teacherProfileId: string;
  let volunteerProfileId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const teacherUser = await prisma.user.create({
      data: { email: teacherEmail, password: "unused", role: "TEACHER", organizationId },
    });
    const teacherProfile = await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "Card",
        lastName: "Teacher",
        gender: "Female",
        phone: "+1-555-0700",
        email: teacherEmail,
        approvedAt: new Date(),
      },
    });
    teacherProfileId = teacherProfile.id;

    // Volunteer with no tribe and no department — the exact case the camper
    // card design cannot handle at all.
    const volunteerUser = await prisma.user.create({
      data: { email: volunteerEmail, password: "unused", role: "VOLUNTEER", organizationId },
    });
    const volunteerProfile = await prisma.staffProfile.create({
      data: {
        userId: volunteerUser.id,
        organizationId,
        campId,
        type: "VOLUNTEER",
        status: "APPROVED",
        firstName: "Card",
        lastName: "Volunteer",
        gender: "Male",
        phone: "+1-555-0701",
        email: volunteerEmail,
        approvedAt: new Date(),
      },
    });
    volunteerProfileId = volunteerProfile.id;
  });

  test.afterAll(async () => {
    await deleteStaffByEmail(teacherEmail);
    await deleteStaffByEmail(volunteerEmail);
  });

  test("admin can print an approved teacher's badge as a PDF", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto(`/admin/teachers/${teacherProfileId}`);

    const printBadgeBtn = page.getByTestId("print-badge-button");
    await expect(printBadgeBtn).toBeVisible({ timeout: 10000 });

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      printBadgeBtn.click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain(`/api/staff/${teacherProfileId}/id-card.pdf`);

    // A qrToken should have been lazily issued by the route.
    await expect
      .poll(async () => (await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacherProfileId } })).qrToken)
      .not.toBeNull();
  });

  test("a volunteer with no tribe and no department still produces a card (no 400)", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto(`/admin/volunteers/${volunteerProfileId}`);

    const printBadgeBtn = page.getByTestId("print-badge-button");
    await expect(printBadgeBtn).toBeVisible({ timeout: 10000 });

    const res = await page.request.get(`/api/staff/${volunteerProfileId}/id-card.pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    const body = await res.body();
    expect(body.length).toBeGreaterThan(0);
  });

  test("public single-card image route serves a PNG once a token exists", async ({ page }) => {
    const profile = await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacherProfileId } });
    expect(profile.qrToken).not.toBeNull();

    const res = await page.request.get(`/api/staff-id-card/${profile.qrToken}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("staff sample card route renders without a DB lookup", async ({ page }) => {
    const res = await page.request.get("/api/staff-id-card/sample");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
});
