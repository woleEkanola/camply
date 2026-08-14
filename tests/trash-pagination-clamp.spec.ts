import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Covers the reported bug: Table.tsx's local-mode pagination never clamped
 * `currentPage` when `data` shrank (e.g. after a bulk delete) — only
 * SearchBar's onChange/onClear and the page-size <select> reset it. The
 * pagination bar is also gated on `totalPages > 1`, so once totalPages drops
 * to 1 (or the current page count) the bar disappears while currentPage is
 * still stuck beyond it, `pageData` becomes an empty slice, and the table
 * renders its empty state even though rows still exist. Reproduced here on
 * /admin/trash: create enough soft-deleted campuses to force multiple
 * pages, jump to the last page, select-all + permanently delete everything
 * on it, and confirm the view doesn't fall into "Trash is empty" while
 * earlier-page items remain.
 */
test.describe("Admin Trash: pagination survives a bulk delete on the last page", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  const campusIds: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    // 25 soft-deleted campuses guarantees at least 3 pages at the Table's
    // default 10-per-page, regardless of whatever else is already in this
    // shared fixture org's trash.
    for (let i = 0; i < 25; i++) {
      const campus = await prisma.campus.create({
        data: {
          name: `E2E Paginate Campus ${Date.now()}-${i}`,
          slug: `e2e-paginate-campus-${Date.now()}-${i}`,
          address: "1 E2E Paginate Way",
          city: "Testville",
          country: "Testland",
          organizationId,
          deletedAt: new Date(),
        },
      });
      campusIds.push(campus.id);
    }
  });

  test.afterAll(async () => {
    if (campusIds.length) {
      await prisma.campus.deleteMany({ where: { id: { in: campusIds } } });
    }
  });

  test("deleting every item on the last page clamps back to a valid page instead of showing an empty trash", async ({ page }) => {
    test.setTimeout(60000);
    page.on("dialog", (d) => d.accept());

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/trash");

    // Wait for our fixture data to actually be present, then navigate to
    // the last page.
    await expect(page.getByText(/E2E Paginate Campus/).first()).toBeVisible({ timeout: 15000 });

    const pagerText = page.locator("span", { hasText: /^\d+ \/ \d+$/ });
    await expect(pagerText).toBeVisible({ timeout: 10000 });
    const nextPageButton = page.getByRole("button", { name: "Next page" });

    // Click to the last page — more robust than parsing "current / total"
    // and reading it once, and exercises the real pagination controls a
    // user would click.
    for (let i = 0; i < 20; i++) {
      if (await nextPageButton.isDisabled()) break;
      await nextPageButton.click();
      await page.waitForTimeout(150);
    }

    const [, totalBefore] = (await pagerText.textContent())!.split(" / ").map(Number);
    expect(totalBefore).toBeGreaterThan(1); // sanity: we do have multiple pages

    // Select every row on this last page and permanently delete them all.
    // Table.tsx dual-renders a desktop <table> and a mobile <ul> card list,
    // both with this same aria-label — only one is actually visible at the
    // viewport in use.
    await page.getByLabel("Select all rows on this page").locator("visible=true").check();
    const deleteButton = page.getByRole("button", { name: "Delete Selected Forever" });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for the bulk delete to finish and the selection to clear.
    await expect(page.locator("text=5 selected")).not.toBeVisible({ timeout: 15000 });

    // The fix: currentPage clamps to the new totalPages instead of staying
    // stuck beyond it. Either the pager is gone (because everything now
    // fits on one page) or it shows a page number within the new range —
    // what must NOT happen is the empty-state message while our own
    // remaining campuses (from earlier pages) are still in the trash.
    await expect(page.getByText("Trash is empty")).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/E2E Paginate Campus/).first()).toBeVisible();

    // The last page's items were permanently deleted. The page count should
    // have decreased (or the pager disappears if everything now fits on one page).
    // We don't assert which specific fixture campuses remain because other tests'
    // trash may have interleaved on the last page; we only care that the bulk
    // purge actually removed rows and the view didn't fall into an empty state.
    // The selection clears before the invalidated trash query necessarily
    // finishes refetching, so wait for pagination to observe the deletion
    // instead of sampling its previous text immediately.
    await expect.poll(async () => {
      const totalAfter = await page.locator("span", { hasText: /^\d+ \/ \d+$/ }).textContent().catch(() => null);
      if (!totalAfter) return 1; // Everything now fits on one page.
      return Number(totalAfter.split(" / ")[1]);
    }, { timeout: 15000 }).toBeLessThan(totalBefore);
  });
});
