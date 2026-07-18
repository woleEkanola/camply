import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteCamperByEmail } from "./helpers";

/**
 * The two genuinely new mobile-only operational flows from Phase B:
 *  - Registrations' Filters bottom-sheet (admin/registrations/page.tsx) —
 *    replaces the desktop inline Campus/Status <Select>s, which don't
 *    render at all below `md`.
 *  - An inline row action (Approve) rendered into a Table card's actions
 *    footer rather than opening the full detail drawer.
 */
test.describe("Mobile operational flows — registrations", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 390, height: 844 } });

  const parentEmail = `e2e-mobile-op-parent-${Date.now()}@camply.test`;
  let camperId: string;
  let registrationId: string;
  let camperName: string;

  test.beforeAll(async () => {
    const { organizationId, campId, campusId } = await getFixtureOrgContext();
    camperName = `Mobile Op Camper ${Date.now()}`;

    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId, firstName: "Mobile", lastName: "Parent" },
    });

    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        userId: parent.id,
        organizationId,
        homeCampusId: campusId,
        gender: "Male",
        dateOfBirth: new Date("2013-04-10"),
      },
    });
    camperId = camper.id;

    const reg = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId,
        status: "PENDING",
        registrationNumber: `E2E-MOBOP-${Date.now()}`,
      },
    });
    registrationId = reg.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await deleteCamperByEmail(parentEmail);
  });

  test("Filters bottom-sheet applies a status filter, and the card's inline Approve works", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await expect(page.getByRole("heading", { name: "Registrations", exact: true })).toBeVisible();

    // Desktop's inline filter <Select>s don't render at all below `md`.
    await expect(page.getByTestId("registration-status-filter")).toHaveCount(0);
    const filtersButton = page.getByRole("button", { name: "Filters" });
    await expect(filtersButton).toBeVisible();

    await filtersButton.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Filters", { exact: true })).toBeVisible();
    await sheet.getByTestId("registration-status-filter").selectOption("PENDING");
    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect(sheet).not.toBeVisible();

    // Filters button now shows an active-filter count badge.
    await expect(filtersButton.getByText("1", { exact: true })).toBeVisible();

    // The fixture registration's card, with its inline Approve action.
    const card = page.locator("li", { hasText: camperName }).first();
    await expect(card).toBeVisible();
    // exact:true — the card's outer div has role="button" too (onRowClick
    // opens the detail drawer) with no aria-label, so its accessible name
    // falls back to its full text content, which includes "Approve" itself.
    await card.getByRole("button", { name: "Approve", exact: true }).click();

    await expect(async () => {
      const reg = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
      expect(reg.status).toBe("APPROVED");
    }).toPass({ timeout: 10000 });
  });
});
