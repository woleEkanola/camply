import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, findCampusCard } from "./helpers";

test.describe("Admin: Campus detail and rep display", () => {
  test.describe.configure({ mode: "serial" });

  const campusName = `E2E Campus Detail ${Date.now()}`;
  let campusId: string | undefined;
  let organizationId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    const repUser = await prisma.user.create({
      data: {
        email: `e2e-campus-rep-${Date.now()}@camply.test`,
        password: "unused",
        role: "CAMPUS_REPRESENTATIVE",
        organizationId,
      },
    });

    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        slug: `e2e-campus-detail-${Date.now()}`,
        address: "42 Detail Ave",
        city: "Testville",
        country: "Testland",
        organizationId,
        reps: { connect: { id: repUser.id } },
      },
    });
    campusId = campus.id;
  });

  test.afterAll(async () => {
    if (campusId) {
      await prisma.campus.update({ where: { id: campusId }, data: { reps: { set: [] } } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
    await prisma.user.deleteMany({ where: { email: { contains: "e2e-campus-rep-" } } });
  });

  test("campus card shows rep and opens detail page with stats", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");

    const card = await findCampusCard(page, campusName);

    const repUser = await prisma.user.findFirst({
      where: { email: { contains: "e2e-campus-rep-" } },
      orderBy: { createdAt: "desc" },
    });

    // Card shows rep count (not raw user id)
    await expect(card.getByText("1 Representatives")).toBeVisible();
    await expect(card).not.toContainText(repUser?.id ?? "should-not-match");

    // Open detail page (card heading area has no stopPropagation)
    await card.getByRole("heading", { name: campusName }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/campuses/${campusId}`), { timeout: 10000 });
    await expect(page.getByRole("heading", { name: campusName })).toBeVisible();
    await expect(page.getByText("Campus Representatives")).toBeVisible();
    await expect(page.getByText(repUser?.email ?? "")).toBeVisible();
    await expect(page.getByText(/42 Detail Ave/)).toBeVisible();
  });
});

test.describe("Admin: Campus detail — signup link enable/disable", () => {
  test.describe.configure({ mode: "serial" });

  const campusName = `E2E Campus Link Toggle ${Date.now()}`;
  let campusId: string | undefined;
  let signupLinkId: string | undefined;
  let organizationId: string | undefined;
  let campId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        slug: `e2e-campus-link-toggle-${Date.now()}`,
        address: "7 Toggle St",
        city: "Testville",
        country: "Testland",
        organizationId,
      },
    });
    campusId = campus.id;

    const link = await prisma.signupLink.create({
      data: { token: `e2e-toggle-token-${Date.now()}`, campusId: campus.id, campId, active: true, quota: 0 },
    });
    signupLinkId = link.id;
  });

  test.afterAll(async () => {
    if (signupLinkId) await prisma.signupLink.deleteMany({ where: { id: signupLinkId } });
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  test("admin can disable and re-enable a campus's signup link from the detail page, with the badge reflecting real state", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto(`/admin/campuses/${campusId}`);

    await expect(page.getByRole("heading", { name: campusName })).toBeVisible({ timeout: 10000 });

    const linkCard = page.getByTestId("signup-link-card");
    await expect(linkCard.getByText("Active", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Disable Signup Link" }).click();
    await expect(page.getByRole("button", { name: "Enable Signup Link" })).toBeVisible({ timeout: 10000 });
    await expect(linkCard.getByText("Inactive", { exact: true })).toBeVisible();
    await expect(page.getByText(/This link is disabled/)).toBeVisible();

    await expect
      .poll(async () => (await prisma.signupLink.findUniqueOrThrow({ where: { id: signupLinkId! } })).active)
      .toBe(false);

    await page.getByRole("button", { name: "Enable Signup Link" }).click();
    await expect(page.getByRole("button", { name: "Disable Signup Link" })).toBeVisible({ timeout: 10000 });
    await expect(linkCard.getByText("Active", { exact: true })).toBeVisible();

    await expect
      .poll(async () => (await prisma.signupLink.findUniqueOrThrow({ where: { id: signupLinkId! } })).active)
      .toBe(true);
  });
});
