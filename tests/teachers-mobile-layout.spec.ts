import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, prisma, visibleText, onlyVisible } from "./helpers";

/**
 * /admin/teachers on mobile (StaffListPage.tsx + StaffCard.tsx + CampusQuotasCard.tsx):
 * - Header action buttons ("Auto Assign Tribes" etc.) must not overflow the
 *   viewport or spill wrapped text outside the button's box.
 * - StatCard labels must not be clipped mid-word.
 * - Campus Quotas renders collapsed by default, positioned above the teacher
 *   list on mobile (a second, desktop-only copy lives in the sidebar).
 * - A teacher row with a long name/email/phone/campus (realistic worst case)
 *   must truncate instead of forcing the page wider — an empty list can't
 *   catch this, since there's nothing there to overflow.
 */
test.describe("Teachers page — mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  const longTeacherEmail = `e2e-teacher-mobile-layout-${Date.now()}@camply.test`;
  let parentUserId: string;
  let staffProfileId: string;
  let longCampusId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    const longCampus = await prisma.campus.create({
      data: {
        name: `Extremely Long Campus Name For Overflow Testing Purposes ${Date.now()}`,
        slug: `e2e-long-campus-${Date.now()}`,
        address: "1 Test St",
        city: "Testville",
        country: "Testland",
        organizationId,
      },
    });
    longCampusId = longCampus.id;

    const user = await prisma.user.create({
      data: { email: longTeacherEmail, password: "x", role: "PARENT", organizationId },
    });
    parentUserId = user.id;

    const profile = await prisma.staffProfile.create({
      data: {
        userId: parentUserId,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "Bartholomew-Nathaniel",
        lastName: "Chukwuemeka-Adebayo-Okonkwo",
        phone: "+234-801-234-5678-EXT-99999",
        email: longTeacherEmail,
        preferredCampusId: longCampusId,
        skills: ["Extremely Long Skill Name For Testing", "Another Long Skill Name"],
      },
    });
    staffProfileId = profile.id;
  });

  test.afterAll(async () => {
    try {
      await prisma.staffProfile.deleteMany({ where: { id: staffProfileId } });
      await prisma.user.deleteMany({ where: { id: parentUserId } });
      await prisma.campus.deleteMany({ where: { id: longCampusId } });
    } catch {
      // best-effort cleanup
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/teachers");
    await page.getByRole("heading", { name: "Teachers", exact: true, level: 1 }).waitFor({ state: "visible", timeout: 15000 });
  });

  // The real scroll container is AppShell's `<main className="… overflow-auto …">`,
  // so horizontal overflow shows up as main.scrollWidth > main.clientWidth — NOT on
  // document.documentElement (main clips/scrolls it). Measuring the document is what
  // let a real overflow slip past this spec before.
  async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
    const { scrollWidth, clientWidth } = await page.evaluate(() => {
      const main = document.querySelector("main");
      return {
        scrollWidth: main?.scrollWidth ?? document.documentElement.scrollWidth,
        clientWidth: main?.clientWidth ?? document.documentElement.clientWidth,
      };
    });
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  }

  test("page has no horizontal overflow (empty/default state)", async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  test("a row with long name/email/phone/campus doesn't force horizontal overflow — list view", async ({ page }) => {
    await page.getByPlaceholder(/Search by name, email or phone/i).fill(longTeacherEmail);
    await expect(visibleText(page, longTeacherEmail).first()).toBeVisible({ timeout: 10000 });
    await assertNoHorizontalOverflow(page);
  });

  test("a row with long name/email/phone/campus doesn't force horizontal overflow — card view", async ({ page }) => {
    await page.getByPlaceholder(/Search by name, email or phone/i).fill(longTeacherEmail);
    await page.getByRole("button", { name: "Cards" }).click();
    await expect(visibleText(page, longTeacherEmail).first()).toBeVisible({ timeout: 10000 });
    await assertNoHorizontalOverflow(page);
  });

  test("selecting a row shows the bulk action bar without widening the page", async ({ page }) => {
    await page.getByPlaceholder(/Search by name, email or phone/i).fill(longTeacherEmail);
    await expect(visibleText(page, longTeacherEmail).first()).toBeVisible({ timeout: 10000 });
    // Select the first row's checkbox to reveal the fixed bottom bulk action bar.
    await onlyVisible(page.getByRole("checkbox", { name: /Select/i })).first().check();
    await expect(page.getByText(/teacher(s)? selected/i).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test("header action buttons render single-line, not clipped", async ({ page }) => {
    for (const name of ["Auto Assign Tribes", "Auto Assign Depts", /Add Teacher/]) {
      const button = page.getByRole("button", { name }).first();
      await expect(button).toBeVisible();
      const { scrollHeight, clientHeight } = await button.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
    }
  });

  test("stat card labels are not truncated mid-word", async ({ page }) => {
    for (const label of ["Total Teachers", "Pending Review", "Approved", "Assigned", "Unassigned"]) {
      const text = await page.getByText(label, { exact: true }).first().textContent();
      expect(text?.trim()).toBe(label);
    }
  });

  test("Campus Quotas is collapsed by default and sits above the teacher list", async ({ page }) => {
    const quotasHeading = page.getByRole("heading", { name: "Campus Quotas" }).first();
    await expect(quotasHeading).toBeVisible();

    // Collapsed: per-campus rows aren't rendered yet.
    await expect(page.getByText("Set quota").or(page.getByText("Edit quota")).first()).not.toBeVisible();

    // Positioned above the teacher list content (status tabs / table).
    const quotasBox = await quotasHeading.boundingBox();
    const tabsBox = await page.getByRole("button", { name: "All" }).first().boundingBox();
    expect(quotasBox && tabsBox && quotasBox.y).toBeLessThan(tabsBox!.y);

    // Expands on click.
    await quotasHeading.click();
    await expect(page.getByText("Set quota").or(page.getByText("Edit quota")).first()).toBeVisible({ timeout: 5000 });
  });
});
