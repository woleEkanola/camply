import { test, expect, type Page } from "@playwright/test";
import {
  prisma,
  getFixtureOrgContext,
  waitForOtp,
  deleteCamperByEmail,
} from "./helpers";

// Mirrors the login page's mobile/desktop dual-markup pattern (see auth.spec.ts) —
// scope to the visible one rather than the CSS-hidden duplicate.
function emailInput(page: Page) {
  return page.locator('input[placeholder="Enter your email"]:visible');
}
function nextButton(page: Page) {
  return page.locator("button:visible", { hasText: "Next" });
}

/**
 * Exercises the signup-link -> Campus -> Venue flow from decision #2 of the
 * refactor: a parent only ever picks a Campus (via the link they were given),
 * never a Venue. Registration.venueId stays null through signup and is
 * assigned automatically at approval time when the Camp has exactly one
 * Venue (see approveRegistrationInTx in src/server/registration/engine.ts).
 */
test.describe("Signup link -> Campus registration -> Venue auto-assignment", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-signup-flow-${Date.now()}@camply.test`;
  let campusId: string;
  let signupToken: string;
  let registrationId: string | undefined;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Signup Campus ${Date.now()}`,
        slug: `e2e-signup-campus-${Date.now()}`,
        address: "1 Signup St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    campusId = campus.id;

    const token = `${campus.slug}_${(await prisma.camp.findUniqueOrThrow({ where: { id: campId } })).slug}`;
    await prisma.signupLink.create({ data: { token, campusId, campId, active: true } });
    signupToken = token;
  });

  test.afterAll(async () => {
    await deleteCamperByEmail(parentEmail);
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("parent completes the wizard via a Campus signup link; draft registration has campusId set and venueId null", async ({ page }) => {
    await page.goto(`/signup/${signupToken}`);

    await emailInput(page).fill(parentEmail);
    await nextButton(page).click();

    await expect(page.locator('input[placeholder="Enter OTP code"]:visible')).toBeVisible({ timeout: 10000 });
    const code = await waitForOtp(parentEmail);
    await page.locator('input[placeholder="Enter OTP code"]:visible').fill(code);
    await page.locator("button:visible", { hasText: "Verify OTP" }).click();

    await expect(page.getByText("Complete Your Profile")).toBeVisible({ timeout: 10000 });
    await page.getByLabel("Full Name").fill("E2E Signup Camper");
    await page.getByLabel("Date of Birth").fill("2012-06-01");
    await page.getByLabel("Gender").selectOption({ label: "Male" });
    await page.locator("button:visible", { hasText: "Complete Signup" }).click();

    await expect
      .poll(async () => {
        const camper = await prisma.camper.findFirst({ where: { user: { email: parentEmail } } });
        if (!camper) return null;
        return prisma.registration.findFirst({ where: { camperId: camper.id } });
      }, { timeout: 15000 })
      .not.toBeNull();

    const camper = await prisma.camper.findFirstOrThrow({ where: { user: { email: parentEmail } } });
    const registration = await prisma.registration.findFirstOrThrow({ where: { camperId: camper.id } });
    registrationId = registration.id;

    expect(registration.campusId).toBe(campusId);
    expect(registration.venueId).toBeNull();
  });

  test("approving the registration auto-assigns the Camp's sole Venue", async () => {
    test.skip(!registrationId, "depends on the previous test's registration fixture");
    const { campId } = await getFixtureOrgContext();

    // The fixture org's active Camp (seeded) has exactly one Venue, so
    // approval should auto-assign it rather than requiring manual selection.
    const venueCount = await prisma.venue.count({ where: { campId } });
    test.skip(venueCount !== 1, "fixture Camp must have exactly one Venue for auto-assignment to fire");

    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    const { approveRegistration } = await import("../src/server/registration/engine");
    await approveRegistration({ registrationId: registrationId!, actorId: "system" });

    const approved = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.venueId).not.toBeNull();
    expect(approved.venueAssignedAt).not.toBeNull();
  });
});
