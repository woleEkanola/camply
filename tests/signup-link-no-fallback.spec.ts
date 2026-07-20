import { test, expect } from "@playwright/test";
import { loginWithPassword, deleteCamperByEmail, prisma, getFixtureOrgContext } from "./helpers";
import bcrypt from "bcryptjs";

test.describe("Signup link fallback prevention", () => {
  const testParentEmail = "testparent-fallback@example.com";
  const parentPassword = "password123";

  test.beforeEach(async () => {
    await deleteCamperByEmail(testParentEmail);
    const { organizationId } = await getFixtureOrgContext();
    const hashedPassword = await bcrypt.hash(parentPassword, 10);
    // Create fresh parent user with no camper profiles
    await prisma.user.create({
      data: {
        email: testParentEmail,
        password: hashedPassword,
        role: "PARENT",
        organizationId,
        active: true,
      },
    });
  });

  test.afterEach(async () => {
    await deleteCamperByEmail(testParentEmail);
  });

  test("parent with no camper profile sees + Add Camper pointing to manual profile creation", async ({ page }) => {
    await loginWithPassword(page, testParentEmail, parentPassword);
    await page.goto("/dashboard");

    const addCamperLink = page.getByRole("link", { name: "+ Add Camper" });
    await expect(addCamperLink).toBeVisible();

    const href = await addCamperLink.getAttribute("href");
    // If the user has no camper, href should NOT point to a signup wizard token automatically
    // It should point to /dashboard/profiles/new
    expect(href).toBe("/dashboard/profiles/new");
  });

  test("parent with no camper but a recorded link click gets + Add Camper anchored to the campus they clicked", async ({ page }) => {
    const { organizationId, campId } = await getFixtureOrgContext();

    // A second campus with its own signup link for the same camp
    const secondCampus = await prisma.campus.create({
      data: {
        name: `E2E ClickAnchor Campus ${Date.now()}`,
        slug: `e2e-click-anchor-${Date.now()}`,
        address: "2 Anchor Ave",
        city: "Testville",
        country: "Testland",
        organizationId,
      },
    });
    const secondLink = await prisma.signupLink.create({
      data: {
        token: `e2e-anchor-${Date.now()}`,
        campusId: secondCampus.id,
        campId,
        active: true,
      },
    });

    const parent = await prisma.user.findUniqueOrThrow({ where: { email: testParentEmail } });
    // Simulate: this user arrived via the second campus's link (click backfilled after login)
    await prisma.signupLinkClick.create({
      data: { signupLinkId: secondLink.id, userId: parent.id },
    });

    try {
      await loginWithPassword(page, testParentEmail, parentPassword);
      await page.goto("/dashboard");

      const addCamperLink = page.getByRole("link", { name: "+ Add Camper" });
      await expect(addCamperLink).toBeVisible();

      const href = await addCamperLink.getAttribute("href");
      // Must route to the campus the user actually clicked — never a random org link
      expect(href).toBe(`/register/${secondLink.token}?step=hub`);
    } finally {
      await prisma.signupLinkClick.deleteMany({ where: { signupLinkId: secondLink.id } });
      await prisma.signupLink.delete({ where: { id: secondLink.id } });
      await prisma.campus.delete({ where: { id: secondCampus.id } });
    }
  });
});
