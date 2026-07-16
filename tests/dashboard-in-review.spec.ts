import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword, showAllRows } from "./helpers";

/**
 * Covers the reported request: parents should see "In Review" instead of
 * the internal "Pending"/"Submitted" status names after submitting. Scoped
 * to parent-facing screens only — StatusBadge's labelOverrides prop
 * (src/components/ui/StatusBadge.tsx) is opt-in per caller, so admin and
 * campus-rep screens keep showing the raw status name, which this spec also
 * asserts (regression guard).
 */
test.describe("Parent dashboard shows 'In Review' for PENDING/SUBMITTED registrations", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const parentEmail = `e2e-in-review-parent-${stamp}@camply.test`;
  const parentPassword = "password123";
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let camperId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const hashed = await bcrypt.hash(parentPassword, 10);
    const parent = await prisma.user.create({
      data: { email: parentEmail, password: hashed, role: "PARENT", organizationId, active: true, firstName: "E2E", lastName: "InReview" },
    });
    const camper = await prisma.camper.create({
      data: { name: `E2E InReview Camper ${stamp}`, firstName: "E2E", lastName: "InReview", userId: parent.id, organizationId, homeCampusId: campusId },
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

  test("parent dashboard list shows 'In Review', not 'Pending'", async ({ page }) => {
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto("/dashboard");

    await expect(page.getByText("In Review").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Pending", { exact: true })).not.toBeVisible();
  });

  test("parent registration detail page shows 'In Review' in the status heading", async ({ page }) => {
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto(`/dashboard/register/${registrationId}`);

    await expect(page.getByText(/Registration Status: In Review/i)).toBeVisible({ timeout: 10000 });
  });

  test("admin registrations page still shows the raw 'PENDING' status (unaffected)", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await showAllRows(page);

    const row = page.locator("tr", { hasText: `E2E InReview Camper ${stamp}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByText("PENDING", { exact: false })).toBeVisible();
  });
});
