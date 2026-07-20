import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Mobile Campus Redesign E2E", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 12 / Pixel 5 mobile viewport

  let campusName: string;
  let campusId: string;
  let organizationId: string;
  let repUserId: string;

  test.beforeEach(async () => {
    const stamp = Date.now();
    // Name starts with "000 MOB" so it sorts as the very first card (#1) in name_asc sort order
    campusName = `000 MOB Test Campus ${stamp}`;

    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    // Ensure owner@camply.com is attached to fixture organization
    await prisma.user.update({
      where: { email: "owner@camply.com" },
      data: { organizationId },
    }).catch(() => {});

    // Create test representative user
    const repUser = await prisma.user.create({
      data: {
        email: `mob-rep-${stamp}@camply.test`,
        password: "password123",
        role: "CAMPUS_REPRESENTATIVE",
        firstName: "Grace",
        lastName: "Kemka",
        organizationId,
      },
    });
    repUserId = repUser.id;

    // Create test campus tied to fixture organizationId
    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        slug: `mob-campus-${stamp}`,
        campusCode: "MOB",
        displayOrder: 0,
        address: "12 Salvation Road",
        city: "Lagos",
        country: "Nigeria",
        organizationId,
        reps: { connect: { id: repUser.id } },
      },
    });
    campusId = campus.id;

    // Create an active signup link for quota / link testing
    await prisma.signupLink.create({
      data: {
        token: `mob-token-${stamp}`,
        campusId: campus.id,
        campId: ctx.campId,
        active: true,
        quota: 100,
      },
    });
  });

  test.afterEach(async () => {
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } }).catch(() => {});
      await prisma.campus.update({ where: { id: campusId }, data: { reps: { set: [] } } }).catch(() => {});
      await prisma.campus.deleteMany({ where: { id: campusId } }).catch(() => {});
    }
    if (repUserId) {
      await prisma.user.deleteMany({ where: { id: repUserId } }).catch(() => {});
    }
  });

  test("verifies mobile campus cards, touch targets, representatives sheet, and overflow menu", async ({ page }) => {
    await page.context().clearCookies();
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses" })).toBeVisible({ timeout: 15000 });

    // 1. Verify Floating Action Button (FAB) or Header Add Campus button is visible
    const fabBtn = page.getByRole("button", { name: "Add Campus" }).first();
    await expect(fabBtn).toBeVisible({ timeout: 10000 });

    // 2. Verify Search Bar is visible on page
    const searchInput = page.getByPlaceholder(/Search campuses/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Wait for tRPC campus grid hydration
    const allCards = page.locator('[data-testid="campus-card"]');
    await expect(allCards.first()).toBeVisible({ timeout: 15000 });

    // 3. Verify Mobile Campus Card layout for test campus (sorted #1 via 000 MOB prefix)
    const card = allCards.filter({ hasText: campusName });
    await expect(card).toBeVisible({ timeout: 15000 });

    // Check campus identity (Level 1 hierarchy title & badge)
    await expect(card.getByRole("heading", { name: campusName })).toBeVisible();
    await expect(card.getByText("MOB")).toBeVisible();
    await expect(card.getByText("• Active").first()).toBeVisible();

    // Check Section 2 — Quick Info
    await expect(card.getByText("Grace Kemka")).toBeVisible();
    await expect(card.getByText("12 Salvation Road, Lagos")).toBeVisible();
    const copyBtn = card.getByRole("button", { name: "Copy" });
    await expect(copyBtn).toBeVisible();

    // Check Section 3 — Registration Capacity & Metrics
    await expect(card.getByText("0 / 100")).toBeVisible();
    await expect(card.getByText("100 slots remaining")).toBeVisible();

    // Check Section 4 — Touch Target Sizing (>= 44px min-height)
    const editBtn = card.getByRole("button", { name: "Edit", exact: true });
    const editBox = (await editBtn.boundingBox())!;
    expect(editBox.height).toBeGreaterThanOrEqual(44);

    const repsBtn = card.getByRole("button", { name: "Manage Reps" });
    const repsBox = (await repsBtn.boundingBox())!;
    expect(repsBox.height).toBeGreaterThanOrEqual(44);

    // 4. Open Representatives Sheet by tapping Representatives row
    await card.getByText("Representatives").first().click();
    const repDialog = page.getByRole("dialog");
    await expect(repDialog.getByText(`Representatives — ${campusName}`)).toBeVisible({ timeout: 5000 });
    await expect(repDialog.getByText("Grace Kemka")).toBeVisible();
    await repDialog.getByRole("button", { name: "Cancel" }).click();

    // 5. Open Registration Analytics Modal
    await card.getByText("View registration analytics").click();
    const analyticsDrawer = page.getByRole("dialog");
    await expect(analyticsDrawer.getByText(`Registration Analytics — ${campusName}`)).toBeVisible({ timeout: 5000 });
    await expect(analyticsDrawer.getByText("Capacity Overview")).toBeVisible();
    await analyticsDrawer.getByRole("button", { name: "Close" }).click();

    // 6. Open Card Options Overflow Menu (⋮)
    const menuBtn = card.getByRole("button", { name: "Campus options menu" });
    await menuBtn.click();

    // Check overflow items
    await expect(page.getByText("Edit Campus")).toBeVisible();
    await expect(page.getByText("Manage Representatives")).toBeVisible();
    await expect(page.getByText("Copy Registration Link")).toBeVisible();
    await expect(page.getByText("Duplicate Campus")).toBeVisible();
    await expect(page.getByText("Delete Campus")).toBeVisible();
  });
});
