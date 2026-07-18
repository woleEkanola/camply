import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import { prisma, getFixtureOrgContext, deleteCamperByEmail, resetSystemFieldDefaults } from "./helpers";

/**
 * Business rule: a family (one PARENT account) is locked to ONE campus — every
 * camper under a parent must share the same homeCampus. This supersedes the
 * earlier "per-link attribution" behavior this file used to assert (where a
 * second teen added via a different campus's link was attributed to that other
 * campus). The parent dashboard was showing one family's two children at two
 * different campuses; that is now prevented at the source.
 *
 * Two things enforce the rule:
 *  1. signupLink.getActiveForUser scopes the dashboard "+ Add Camper" link to the
 *     parent's own campus, so a second child is never silently routed elsewhere.
 *  2. api/auth/signup/route.ts hard-blocks (409 CAMPUS_MISMATCH) any attempt to
 *     create a camper at a campus different from the parent's existing campers —
 *     a backstop for anyone who reaches a different campus's link URL directly.
 *
 * This test drives one parent through both a same-campus add (allowed) and a
 * different-campus add (blocked) and asserts the DB writes + the dashboard link.
 */
test.describe("Family is locked to one campus", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-campus-lock-${Date.now()}@camply.test`;
  const parentPassword = "password123";
  let tokenA: string;
  let signupTokenA: string;
  let signupTokenB: string;
  let campusAId: string;
  let campusBId: string;
  let midAgeYear: number;
  const stamp = Date.now();

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    await resetSystemFieldDefaults("CAMPER");
    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId } });
    const minAge = camp.minAge ?? 6;
    const maxAge = camp.maxAge ?? 17;
    midAgeYear = new Date().getFullYear() - Math.round((minAge + maxAge) / 2);

    const campusA = await prisma.campus.create({
      data: {
        name: `E2E Lock Campus A ${stamp}`,
        slug: `e2e-lock-campus-a-${stamp}`,
        address: "1 A St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    campusAId = campusA.id;
    const campusB = await prisma.campus.create({
      data: {
        name: `E2E Lock Campus B ${stamp}`,
        slug: `e2e-lock-campus-b-${stamp}`,
        address: "1 B St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    campusBId = campusB.id;

    tokenA = randomBytes(16).toString("hex");
    await prisma.signupLink.create({ data: { token: tokenA, campusId: campusAId, campId, active: true } });
    signupTokenA = `${campusA.slug}_${camp.slug}`;

    const tokenB = randomBytes(16).toString("hex");
    await prisma.signupLink.create({ data: { token: tokenB, campusId: campusBId, campId, active: true } });
    signupTokenB = `${campusB.slug}_${camp.slug}`;
  });

  test.afterAll(async () => {
    await deleteCamperByEmail(parentEmail);
    await prisma.signupLink.deleteMany({ where: { campusId: { in: [campusAId, campusBId] } } });
    await prisma.campus.deleteMany({ where: { id: { in: [campusAId, campusBId] } } });
  });

  async function addFirstTeen(page: import("@playwright/test").Page, firstName: string, gender: "Male" | "Female") {
    // From the hub, "Register a Teen" advances to the teens step, which auto-opens
    // the entry form when the parent has no teens yet (Teens.tsx showAdd default).
    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
    await page.locator("#teen-fn").fill(firstName);
    await page.locator("#teen-ln").fill("Teen");
    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const dobSelects = page.locator("select:visible");
    await dobSelects.nth(0).selectOption("06");
    await dobSelects.nth(1).selectOption("15");
    await dobSelects.nth(2).selectOption(String(midAgeYear));
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);
    await page.locator(`input[name="teen-gender"][value="${gender}"]`).click();
    await page.getByRole("button", { name: "Add Teen" }).click();
  }

  test("same-campus children are allowed, a different-campus child is blocked", async ({ page }) => {
    test.setTimeout(90000);

    // --- Create the account + first teen through Campus A's link (sets the anchor) ---
    await page.goto(`/register/${signupTokenA}`);
    await page.getByRole("button", { name: "Start Registration" }).click();
    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 5000 });
    await page.locator("#reg-firstname").fill("Lock");
    await page.locator("#reg-lastname").fill("Parent");
    await page.locator("#reg-pw").fill(parentPassword);
    await page.locator("#reg-pw-confirm").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText(/^Welcome/)).toBeVisible({ timeout: 10000 });

    await addFirstTeen(page, "LockOne", "Male");
    await expect(page.getByText("LockOne Teen")).toBeVisible({ timeout: 5000 });

    // Scope all camper lookups to this parent's userId (parentEmail is unique per
    // run) so a leftover camper from a crashed prior run can't shadow the assertions.
    const parent = await prisma.user.findUniqueOrThrow({ where: { email: parentEmail } });
    const camper1 = await prisma.camper.findFirstOrThrow({ where: { userId: parent.id, firstName: "LockOne" } });
    expect(camper1.homeCampusId).toBe(campusAId);

    // --- Dashboard "+ Add Camper" link must point at the parent's OWN campus (A),
    // not some other campus's newest link. getActiveForUser returns the raw
    // SignupLink.token, so the href carries Campus A's tokenA. ---
    await page.goto("/dashboard");
    const addCamperLink = page.getByRole("link", { name: "+ Add Camper" });
    await expect(addCamperLink).toBeVisible({ timeout: 10000 });
    await expect(addCamperLink).toHaveAttribute("href", new RegExp(tokenA));

    // --- The hard-block lives in /api/auth/signup; test it directly at the API
    // layer (the level it actually guards). page.request reuses the parent's
    // authenticated session cookies from account creation above. ---

    // Same campus (A) → allowed (201), camper created at Campus A.
    const sameRes = await page.request.post("/api/auth/signup", {
      data: { email: parentEmail, name: "SameCampus Teen", token: signupTokenA },
    });
    expect(sameRes.status()).toBe(201);
    const sameCamper = await prisma.camper.findFirstOrThrow({ where: { userId: parent.id, name: "SameCampus Teen" } });
    expect(sameCamper.homeCampusId).toBe(campusAId);

    // Different campus (B) → hard-blocked (409 CAMPUS_MISMATCH), no camper created.
    const otherRes = await page.request.post("/api/auth/signup", {
      data: { email: parentEmail, name: "OtherCampus Teen", token: signupTokenB },
    });
    expect(otherRes.status()).toBe(409);
    const otherBody = await otherRes.json();
    expect(otherBody.code).toBe("CAMPUS_MISMATCH");
    const blocked = await prisma.camper.findFirst({ where: { userId: parent.id, name: "OtherCampus Teen" } });
    expect(blocked).toBeNull();

    // Every camper under this parent stays at Campus A.
    const allCampers = await prisma.camper.findMany({ where: { userId: parent.id, deletedAt: null } });
    expect(allCampers.length).toBeGreaterThanOrEqual(2);
    expect(allCampers.every((c) => c.homeCampusId === campusAId)).toBe(true);
  });
});
