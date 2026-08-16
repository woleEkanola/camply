import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Covers duplicate-role detection and the "Merge into…" resolution flow on
 * the organogram — the user-driven cleanup path for anything the automatic
 * reconcile can't safely auto-adopt (e.g. two ordinary roles that happen to
 * share a name in the same department).
 */
test.describe("Organogram: duplicate role detection and merge", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  const dupeName = `E2E Dupe Role ${stamp}`;
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let deptId: string;
  let sourceId: string;
  let targetId: string;
  let teacherStaffId: string;
  const emails: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const dept = await prisma.department.create({ data: { organizationId, campId, name: `E2E Dupe Dept ${stamp}` } });
    deptId = dept.id;

    const source = await prisma.position.create({ data: { campId, departmentId: dept.id, name: dupeName } });
    const target = await prisma.position.create({ data: { campId, departmentId: dept.id, name: dupeName } });
    sourceId = source.id;
    targetId = target.id;

    const email = `e2e-orgdupe-holder-${stamp}@camply.test`;
    emails.push(email);
    const user = await prisma.user.create({ data: { email, password: "x", role: "TEACHER", organizationId, homeCampusId: campusId } });
    const profile = await prisma.staffProfile.create({
      data: {
        userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: "E2E-Dupe", lastName: "Holder", phone: `080${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`, email,
      },
    });
    teacherStaffId = profile.id;
    await prisma.positionAssignment.create({ data: { positionId: source.id, staffId: profile.id, isCurrent: true } });
  });

  test.afterAll(async () => {
    await prisma.positionAssignment.deleteMany({ where: { positionId: { in: [sourceId, targetId] } } });
    await prisma.position.deleteMany({ where: { id: { in: [sourceId, targetId] } } });
    await prisma.department.deleteMany({ where: { id: deptId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  test("flags the duplicate pair with a banner and per-node badges, and merging leaves one role holding the assignment", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Organogram" }).click();
    await expect(page.getByTestId("camp-organogram")).toBeVisible({ timeout: 20000 });

    await expect(page.getByTestId("organogram-duplicates-banner")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId(`organogram-duplicate-badge-${sourceId}`)).toBeVisible();
    await expect(page.getByTestId(`organogram-duplicate-badge-${targetId}`)).toBeVisible();

    await page.getByTestId("organogram-duplicates-banner").getByRole("button", { name: "Review" }).click();
    const reviewDialog = page.getByTestId("dialog-panel");
    await expect(reviewDialog).toBeVisible();
    // The fixture org's other departments already carry legitimate-looking
    // duplicate groups from seed data (e.g. two "X Team Member" positions
    // per department), so this must target the specific group card
    // containing dupeName — `div.rounded-xl` is each group's own card
    // (`<div key={group.key} className="rounded-xl ...">`), not just any
    // ancestor div that happens to contain the text (which over-matches to
    // the whole dialog body and every group's "Merge into…" button in it).
    const ourGroup = reviewDialog.locator("div.rounded-xl", { hasText: dupeName });
    await ourGroup.getByRole("button", { name: "Merge into…" }).click();

    const mergeDialog = page.getByTestId("organogram-merge-dialog");
    await expect(mergeDialog).toBeVisible();
    // Both options in this pair share the same visible name (that's the
    // whole premise of "duplicate"), so a text-based selectOption can't
    // disambiguate them — the dialog already pre-selects source=rows[0]/
    // target=rows[1] (oldest-created first) when opened from "Merge into…",
    // which lines up with this test's sourceId/targetId creation order.
    await expect(mergeDialog.locator("#organogram-merge-target")).toHaveValue(targetId);
    await mergeDialog.getByRole("button", { name: "Merge", exact: true }).click();
    await expect(mergeDialog).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(async () => prisma.position.count({ where: { id: { in: [sourceId, targetId] }, deletedAt: null } }), { timeout: 10000 })
      .toBe(1);

    const survivingAssignment = await prisma.positionAssignment.findFirst({ where: { staffId: teacherStaffId, isCurrent: true } });
    expect(survivingAssignment).not.toBeNull();
    expect([sourceId, targetId]).toContain(survivingAssignment!.positionId);

    // The banner may still show — the fixture org carries other unrelated
    // duplicate groups (e.g. seeded "X Team Member" pairs) — but THIS
    // specific pair's badges must be gone now that one side is soft-deleted.
    await expect(page.getByTestId(`organogram-duplicate-badge-${sourceId}`)).toHaveCount(0);
    await expect(page.getByTestId(`organogram-duplicate-badge-${targetId}`)).toHaveCount(0);
  });
});
