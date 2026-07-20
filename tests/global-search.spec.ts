import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Global Search & Profile Deep-Linking", () => {
  const stamp = Date.now();
  const adminEmail = `e2e-search-admin-${stamp}@camply.test`;
  const adminPassword = "password123";
  let organizationId: string;
  let campusId: string;
  let camperId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusId = ctx.campusId;

    const hashed = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashed,
        role: "ADMIN",
        organizationId,
        active: true,
        firstName: "SearchAdmin",
        lastName: "User",
      },
    });

    const parent = await prisma.user.create({
      data: {
        email: `searchparent-${stamp}@test.com`,
        password: hashed,
        role: "PARENT",
        organizationId,
        active: true,
      },
    });

    const camper = await prisma.camper.create({
      data: {
        name: `ZeldaSearch Test`,
        firstName: "ZeldaSearch",
        lastName: "Test",
        userId: parent.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;
  });

  test.afterAll(async () => {
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, `searchparent-${stamp}@test.com`] } } });
  });

  test("global search command palette returns camper results", async ({ page }) => {
    await loginWithPassword(page, adminEmail, adminPassword);
    await page.goto("/admin");

    // Open Command Palette via the header search button
    const searchBtn = page.getByRole("button", { name: /Search/i }).first();
    await expect(searchBtn).toBeVisible({ timeout: 10000 });
    await searchBtn.click();

    // Type camper name in Command Palette input
    const input = page.getByPlaceholder("Search campers, registrations, staff, pages...");
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill("ZeldaSearch");

    // Wait for search results to load (debounce + network)
    await expect(page.getByRole("option", { name: /ZeldaSearch Test/i })).toBeVisible({ timeout: 8000 });
  });

  test("direct deep-link to /admin/campers?openCamper=<id> auto-opens profile drawer", async ({ page }) => {
    await loginWithPassword(page, adminEmail, adminPassword);

    // Navigate directly with the openCamper param
    await page.goto(`/admin/campers?openCamper=${camperId}`);

    // Wait for page to fully load
    await expect(page.getByRole("heading", { name: "Campers" })).toBeVisible({ timeout: 10000 });

    // The drawer should auto-open showing the camper's name as its title
    await expect(page.getByText("ZeldaSearch Test").first()).toBeVisible({ timeout: 15000 });
  });
});
