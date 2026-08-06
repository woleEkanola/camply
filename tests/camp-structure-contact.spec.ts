import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail, drawerPanel } from "./helpers";

test.describe("Camp Structure — profile sheet contact actions", () => {
  test.describe.configure({ mode: "serial" });

  const withPhoneEmail = `e2e-cs-contact-phone-${Date.now()}@camply.test`;
  const nigerianPhoneEmail = `e2e-cs-contact-ng-${Date.now()}@camply.test`;
  const noPhoneEmail = `e2e-cs-contact-nophone-${Date.now()}@camply.test`;

  let departmentId: string;
  let withPhoneId: string;
  let nigerianPhoneId: string;
  let noPhoneId: string;
  let campId: string;
  let campusId: string;
  let campusName: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    campusId = ctx.campusId;
    campusName = ctx.campusName;

    const dept = await prisma.department.create({
      data: { organizationId: ctx.organizationId, campId, name: `E2E Contact Department ${Date.now()}` },
    });
    departmentId = dept.id;

    // International (non-Nigerian) number — exercises toWhatsAppDigits'
    // pass-through-and-strip-formatting branch, the reason it isn't built on
    // normalizeNigerianPhone (which would mangle this into "15550700").
    const withPhoneUser = await prisma.user.create({
      data: { email: withPhoneEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId: ctx.organizationId },
    });
    const withPhone = await prisma.staffProfile.create({
      data: {
        userId: withPhoneUser.id,
        organizationId: ctx.organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "CS",
        lastName: "ContactPhoneE2E",
        phone: "+1-555-0700",
        email: withPhoneEmail,
        approvedAt: new Date(),
        departmentId: dept.id,
        isDepartmentHead: true,
        preferredCampusId: campusId,
        assignedTribeId: null,
      },
    });
    withPhoneId = withPhone.id;

    // Nigerian-formatted number — exercises the 0XXXXXXXXXX -> 234XXXXXXXXXX branch.
    const ngUser = await prisma.user.create({
      data: { email: nigerianPhoneEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId: ctx.organizationId },
    });
    const ngPhone = await prisma.staffProfile.create({
      data: {
        userId: ngUser.id,
        organizationId: ctx.organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "CS",
        lastName: "ContactNgE2E",
        phone: "08031234567",
        email: nigerianPhoneEmail,
        approvedAt: new Date(),
        departmentId: dept.id,
      },
    });
    nigerianPhoneId = ngPhone.id;

    // Blank phone — the schema requires the column to be a non-null string,
    // but the app never enforces non-empty, so this reflects real data
    // (e.g. a staff record created before phone was required at signup).
    const noPhoneUser = await prisma.user.create({
      data: { email: noPhoneEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId: ctx.organizationId },
    });
    const noPhone = await prisma.staffProfile.create({
      data: {
        userId: noPhoneUser.id,
        organizationId: ctx.organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "CS",
        lastName: "ContactNoPhoneE2E",
        phone: "",
        email: noPhoneEmail,
        approvedAt: new Date(),
        departmentId: dept.id,
      },
    });
    noPhoneId = noPhone.id;
  });

  test.afterAll(async () => {
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await deleteStaffByEmail(withPhoneEmail);
    await deleteStaffByEmail(nigerianPhoneEmail);
    await deleteStaffByEmail(noPhoneEmail);
  });

  async function openSheetFor(page: import("@playwright/test").Page, lastNameFragment: string) {
    await page.getByTestId("directory-search-input").fill(lastNameFragment);
    const results = page.getByTestId("directory-search-results");
    const row = results.getByText(new RegExp(`CS ${lastNameFragment}`));
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();
    await expect(page.getByTestId("staff-profile-sheet")).toBeVisible({ timeout: 10000 });
  }

  test("profile sheet exposes Call and WhatsApp with correct hrefs for an international number", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await openSheetFor(page, "ContactPhoneE2E");

    const callLink = page.getByTestId("staff-call-link");
    const waLink = page.getByTestId("staff-whatsapp-link");
    await expect(callLink).toHaveAttribute("href", "tel:+1-555-0700");
    await expect(waLink).toHaveAttribute("href", "https://wa.me/15550700");
  });

  test("profile sheet converts a Nigerian local number to the 234-prefixed WhatsApp link", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await openSheetFor(page, "ContactNgE2E");

    await expect(page.getByTestId("staff-whatsapp-link")).toHaveAttribute("href", "https://wa.me/2348031234567");
  });

  test("profile sheet shows Campus and Department labels", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await openSheetFor(page, "ContactPhoneE2E");

    const sheet = page.getByTestId("staff-profile-sheet");
    // exact: true — "Campus" (the label) is a substring of "Demo Campus" (the
    // value), so a plain getByText("Campus") is a strict-mode violation.
    await expect(sheet.getByText("Campus", { exact: true })).toBeVisible();
    await expect(sheet.getByText(campusName)).toBeVisible();
    await expect(sheet.getByText("Department", { exact: true })).toBeVisible();
  });

  test("staff with no phone on file shows the fallback, not a dead tel: link", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await openSheetFor(page, "ContactNoPhoneE2E");

    const sheet = page.getByTestId("staff-profile-sheet");
    await expect(sheet.getByText("No phone on file")).toBeVisible();
    await expect(page.getByTestId("staff-call-link")).toHaveCount(0);
    await expect(page.getByTestId("staff-whatsapp-link")).toHaveCount(0);
  });

  test("\"View full profile\" hands off to the admin StaffDetailDrawer", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await openSheetFor(page, "ContactPhoneE2E");

    await page.getByRole("button", { name: "View full profile" }).click();
    const drawer = drawerPanel(page);
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.getByText("CS ContactPhoneE2E")).toBeVisible();
    // The quick-contact sheet closes once the full profile takes over.
    await expect(page.getByTestId("staff-profile-sheet")).toBeHidden();
  });
});
