import { test, expect } from "@playwright/test";
import {
  prisma,
  getFixtureOrgContext,
  loginWithPassword,
  suspendDuplicateConstraint,
  restoreDuplicateConstraint,
} from "./helpers";

/**
 * Admin registrations page: "Duplicates Only" used to return duplicate rows
 * in plain createdAt-desc order, scattered across whatever page they landed
 * on, with no indication of what a duplicate's siblings actually were —
 * making it hard to tell what's safe to delete. adminList now groups
 * duplicate siblings adjacently (best-status-first) and the "Duplicate"
 * badge shows a sibling-status hint inline.
 */
test.describe("Duplicate registrations: grouping + sibling-status hint", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const camperName = `E2E Dupgroup Camper ${stamp}`;

  let campusId: string;
  let camperId: string;
  let parentId: string;
  let rejectedRegId: string;
  let pendingRegId: string;
  let approvedRegId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    const campus = await prisma.campus.create({
      data: { name: `E2E Dupgroup Campus ${stamp}`, slug: `e2e-dupgroup-campus-${stamp}`, address: "1 Test St", city: "Testville", country: "Testland", organizationId },
    });
    campusId = campus.id;

    const parent = await prisma.user.create({ data: { email: `e2e-dupgroup-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: { name: camperName, userId: parent.id, organizationId, homeCampusId: campusId, dateOfBirth: new Date(2013, 1, 1) },
    });
    camperId = camper.id;

    // Created oldest-first so plain createdAt-desc ordering would normally
    // interleave these with unrelated rows — grouping must override that.
    // These three share camperId+campId, which Registration_camperId_campId_key
    // (partial unique index, WHERE deletedAt IS NULL) now forbids going
    // forward — suspend it for the duration of fixture creation to simulate
    // legacy pre-constraint duplicate data. Restored in afterAll, after these
    // rows are deleted.
    await suspendDuplicateConstraint();
    const rejected = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "REJECTED" } });
    rejectedRegId = rejected.id;
    const pending = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "PENDING" } });
    pendingRegId = pending.id;
    const approved = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "APPROVED" } });
    approvedRegId = approved.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: [rejectedRegId, pendingRegId, approvedRegId] } } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: parentId } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
    await restoreDuplicateConstraint();
  });

  test("Duplicates Only shows all 3 siblings adjacently, best-status-first, with a status hint", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await page.getByRole("button", { name: "List View" }).click();

    await page.getByRole("button", { name: "Duplicates" }).click();

    const rows = page.locator("tr", { hasText: camperName });
    await expect(rows).toHaveCount(3, { timeout: 10000 });

    // Best-to-worst-for-keeping: APPROVED, PENDING, REJECTED.
    const statuses = await rows.evaluateAll((els) => els.map((el) => el.textContent ?? ""));
    const approvedIdx = statuses.findIndex((t) => t.includes("APPROVED"));
    const pendingIdx = statuses.findIndex((t) => t.includes("PENDING"));
    const rejectedIdx = statuses.findIndex((t) => t.includes("REJECTED"));
    expect(approvedIdx).toBeLessThan(pendingIdx);
    expect(pendingIdx).toBeLessThan(rejectedIdx);

    // Every sibling shows a "Duplicate · ..." hint naming its two siblings' statuses.
    await expect(page.getByText(/Duplicate · .*Approved/).first()).toBeVisible();
  });
});
