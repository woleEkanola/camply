import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword, resetSystemFieldDefaults } from "./helpers";

/**
 * Covers the reported bug: clicking "View Registration" on a dashboard
 * camper card did nothing. Root cause was invalid HTML — a real <button>
 * (from the shared Button component) nested inside a next/link <Link>'s
 * <a>, which is fragile for click-through. Fixed by rendering the Link
 * itself styled via the new buttonClassName() export
 * (src/components/ui/Button.tsx) instead of nesting a second interactive
 * element. This test drives the actual dashboard card button — the existing
 * dashboard-in-review.spec.ts only ever page.goto()s the detail URL
 * directly, so the click itself was never previously exercised.
 */
test.describe("Dashboard: View Registration button actually navigates", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const parentEmail = `e2e-view-reg-btn-${stamp}@camply.test`;
  const parentPassword = "password123";
  let camperId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const { organizationId, campId, campusId } = await getFixtureOrgContext();
    await resetSystemFieldDefaults("CAMPER");
    const hashed = await bcrypt.hash(parentPassword, 10);
    const parent = await prisma.user.create({
      data: { email: parentEmail, password: hashed, role: "PARENT", organizationId, active: true, firstName: "E2E", lastName: "ViewBtn" },
    });
    // Card only shows "View Registration" once the camper's profile is
    // complete — otherwise it shows "Complete Profile" regardless of the
    // registration's own status. dateOfBirth + gender are the two required
    // system fields not already covered by firstName/lastName.
    const camper = await prisma.camper.create({
      data: {
        name: `E2E ViewBtn Camper ${stamp}`,
        firstName: "E2E",
        lastName: "ViewBtn",
        dateOfBirth: new Date("2012-06-15"),
        gender: "Male",
        userId: parent.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, status: "PENDING" },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { email: parentEmail } });
  });

  test("clicking the dashboard card's View Registration button navigates to the registration detail page", async ({ page }) => {
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto("/dashboard");

    const card = page.locator("h3", { hasText: `E2E ViewBtn Camper ${stamp}` }).locator("xpath=ancestor::div[contains(@class,'sm:justify-between')]");
    await expect(card).toBeVisible({ timeout: 10000 });

    const viewButton = card.getByRole("link", { name: "View Registration" });
    await expect(viewButton).toBeVisible();
    await viewButton.click();

    await expect(page).toHaveURL(new RegExp(`/dashboard/register/${registrationId}$`), { timeout: 10000 });
    await expect(page.getByText(/Registration Status: In Review/i)).toBeVisible({ timeout: 10000 });
  });
});
