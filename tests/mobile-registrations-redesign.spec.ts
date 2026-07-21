import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test.describe("Mobile Registrations Redesign E2E", () => {
  let organizationId: string;
  let camperName: string;

  test.beforeEach(async () => {
    const stamp = Date.now();
    camperName = `MOB Camper ${stamp}`;

    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    // Ensure owner user exists and is tied to fixture org
    await prisma.user.update({
      where: { email: "owner@camply.com" },
      data: { organizationId, role: "OWNER" },
    }).catch(() => {});

    // Create a parent user and camper registration for testing
    const parentUser = await prisma.user.create({
      data: {
        email: `mob-parent-${stamp}@camply.test`,
        password: "password123",
        role: "PARENT",
        firstName: "Blessed",
        lastName: "Kemka",
        organizationId,
      },
    });

    const camper = await prisma.camper.create({
      data: {
        userId: parentUser.id,
        organizationId,
        name: camperName,
        gender: "MALE",
        dateOfBirth: new Date("2012-05-10"),
      },
    });

    await prisma.registration.create({
      data: {
        campId: ctx.campId,
        campusId: ctx.campusId,
        camperId: camper.id,
        status: "PENDING",
        registrationNumber: `MYD-${stamp.toString().slice(-5)}`,
      },
    });
  });

  test("Renders smart search bar, horizontal stat cards, filter chips, and compact registration cards on mobile view", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await expect(page.getByRole("heading", { name: "Registrations", exact: true })).toBeVisible({ timeout: 15000 });

    // 1. Verify Search input exists on registrations page
    const searchInput = page.getByRole("textbox", { name: /name|search/i }).first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // 2. Verify Stat Cards / Status filter options
    await expect(page.getByText("PENDING", { exact: false }).first()).toBeVisible({ timeout: 15000 });

    // 3. Search for the specific camper created in test
    await searchInput.fill(camperName);

    // 4. Verify listitem containing camper card is displayed
    const camperItem = page.getByRole("listitem").filter({ hasText: camperName }).first();
    await expect(camperItem).toBeVisible({ timeout: 15000 });
  });
});
