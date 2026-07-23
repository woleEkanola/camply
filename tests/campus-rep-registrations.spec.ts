import { test, expect } from "@playwright/test";
import { loginWithPassword, prisma } from "./helpers";

test.describe("Campus Rep Registrations Page", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  let parentId: string;
  let camperId: string;
  let registrationId: string;
  let tempCampusId: string;
  let repId: string;

  // The seeded "Demo Campus" this rep otherwise manages belongs to a stale/orphaned
  // organizationId that no longer matches the rep's own account (local dev-DB drift
  // from prior reseeds, unrelated to any app code) — adminList/getAdminListStats
  // scope by `campus.organizationId === session org`, so that campus never matches
  // and always reports zero registrations. Work around it the same way other specs
  // in this repo do: give the rep their own throwaway campus in the *correct* org.
  test.beforeAll(async () => {
    const rep = await prisma.user.findUniqueOrThrow({ where: { email: "campusrep@camply.com" } });
    repId = rep.id;
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: rep.organizationId! } });
    const campId = org.activeCampId!;

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Reppage Campus ${stamp}`,
        slug: `e2e-reppage-campus-${stamp}`,
        address: "1 Test St",
        city: "Testville",
        country: "Testland",
        organizationId: rep.organizationId!,
        reps: { connect: { id: repId } },
      },
    });
    tempCampusId = campus.id;

    const parent = await prisma.user.create({
      data: { email: `e2e-reppage-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: rep.organizationId! },
    });
    parentId = parent.id;
    const camper = await prisma.camper.create({
      data: { name: `E2E Reppage Camper ${stamp}`, userId: parentId, organizationId: rep.organizationId!, homeCampusId: tempCampusId },
    });
    camperId = camper.id;
    const registration = await prisma.registration.create({
      data: { camperId, campId, campusId: tempCampusId, status: "PENDING" },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    try {
      await prisma.registration.deleteMany({ where: { id: registrationId } });
      await prisma.camper.deleteMany({ where: { id: camperId } });
      await prisma.user.deleteMany({ where: { id: parentId } });
      if (tempCampusId) await prisma.campus.delete({ where: { id: tempCampusId } });
    } catch {
      // best-effort cleanup
    }
  });

  test("renders registrations page with stats cards", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await expect(page).toHaveURL(/\/campus-rep-dashboard$/);

    await page.goto("/campus-rep-dashboard/registrations");
    await expect(page).toHaveURL(/\/campus-rep-dashboard\/registrations$/);

    await page.waitForTimeout(2000);

    await expect(page.getByRole("heading", { name: "Registrations" })).toBeVisible();

    await expect(page.getByText("Total Registrations")).toBeVisible();
  });

  test("card and list view toggle works", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.waitForTimeout(2000);

    // Reviewers default into the "Pending" filter (submitted, not yet recommended).
    // The seeded fixture above is PENDING/unendorsed so it's already included, but
    // clear to "All Statuses" anyway — this test is about the card/list toggle
    // rendering a <table>, not about which filter is active.
    await page.locator("select").first().selectOption("");
    await page.waitForTimeout(500);

    const cardBtn = page.getByText("Card View");
    const listBtn = page.getByText("List View");

    await expect(cardBtn).toBeVisible();
    await expect(listBtn).toBeVisible();

    await page.getByText("List View").click();
    await page.waitForTimeout(500);
    await expect(page.locator("table")).toBeVisible();

    await page.getByText("Card View").click();
    await page.waitForTimeout(500);
    await expect(page.locator("table")).not.toBeVisible();
  });

  test("search filters registrations", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.waitForTimeout(2000);

    const searchInput = page.locator("input[placeholder*='Name, email']");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("zzzznonexistent");
    await page.waitForTimeout(1500);

    await expect(page.getByText("No registrations match your filters")).toBeVisible();
  });

  test("mobile viewport has no horizontal overflow", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForLoadState("networkidle");

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
