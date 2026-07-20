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
});
