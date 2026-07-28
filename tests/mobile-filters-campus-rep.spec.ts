import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Regression coverage for the campus-rep/teacher registrations queue's
 * mobile "Filters" button, which used to be a literal `onOpenFilters={() => {}}`
 * no-op (RegistrationQueue.tsx). It now opens the same self-contained sheet
 * MobileRegistrationsView owns for the admin registrations page — minus the
 * Campus select, since campus-rep callers don't pass a `campusFilter` prop.
 */
test.describe("Mobile Filters — campus-rep registrations queue", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 390, height: 844 } });

  const stamp = Date.now();
  const repEmail = `e2e-mobfilt-rep-${stamp}@camply.test`;
  const parentEmail = `e2e-mobfilt-parent-${stamp}@camply.test`;
  const camperName = `E2E MobFilt Camper ${stamp}`;

  let campusId: string;
  let repId: string;
  let parentId: string;
  let camperId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    const campus = await prisma.campus.create({
      data: { name: `E2E MobFilt Campus ${stamp}`, slug: `e2e-mobfilt-campus-${stamp}`, address: "1 Test St", city: "Testville", country: "Testland", organizationId },
    });
    campusId = campus.id;

    const password = await bcrypt.hash("password123", 10);
    const rep = await prisma.user.create({
      data: { email: repEmail, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusId } } },
    });
    repId = rep.id;

    const parent = await prisma.user.create({ data: { email: parentEmail, password: "x", role: "PARENT", organizationId } });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: { name: camperName, userId: parent.id, organizationId, homeCampusId: campusId },
    });
    camperId = camper.id;

    const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "PENDING" } });
    registrationId = reg.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: { in: [parentId, repId] } } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  test("Filters button opens a working sheet with a Status select", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await expect(page.getByText(camperName).first()).toBeVisible({ timeout: 10000 });

    const filtersButton = page.getByRole("button", { name: "Filters" });
    await expect(filtersButton).toBeVisible();
    await filtersButton.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Filters", { exact: true })).toBeVisible();
    // No campusFilter prop passed by RegistrationQueue — the Campus select must not render.
    await expect(sheet.getByText("Campus", { exact: true })).toHaveCount(0);

    await sheet.getByTestId("registration-status-filter").selectOption("PENDING");
    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect(sheet).not.toBeVisible();

    await expect(filtersButton.getByText("1", { exact: true })).toBeVisible();
  });
});
