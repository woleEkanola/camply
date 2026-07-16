import { test, expect, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import {
  prisma,
  getFixtureOrgContext,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
  loginWithPassword,
  showAllRows,
} from "./helpers";

/**
 * PRD 17.4: ADMIN sets a registration quota per campus (via SignupLink) so no
 * campus dominates the camp. Real submission/approval flows are covered here
 * against the actual running app; the exhaustive concurrency/status-boundary
 * cases already have dedicated vitest coverage in
 * src/server/registration/__tests__/engine.test.ts's "campus registration
 * quota" describe block — this spec proves the same behavior is reachable
 * and visible through the real UI/API a parent and admin actually use.
 */

async function driveTeenToSubmit(page: Page, opts: {
  signupToken: string;
  parentEmail: string;
  parentPassword: string;
  teenFirstName: string;
  teenLastName: string;
}) {
  const { signupToken, parentEmail, parentPassword, teenFirstName, teenLastName } = opts;

  await page.goto(`/register/${signupToken}`);
  const beginBtn = page.getByRole("button", { name: "Start Registration" });
  await expect(beginBtn).toBeVisible({ timeout: 20000 });
  await beginBtn.click();

  await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
  await page.locator('input[type="email"]:visible').fill(parentEmail);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 5000 });
  await page.locator("#reg-firstname").fill("Quota");
  await page.locator("#reg-lastname").fill("Parent");
  await page.locator("#reg-pw").fill(parentPassword);
  await page.locator("#reg-pw-confirm").fill(parentPassword);
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page.getByText(/^Welcome/)).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Register a Teen" }).click();

  await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
  await page.locator("#teen-fn").fill(teenFirstName);
  await page.locator("#teen-ln").fill(teenLastName);

  await page.getByRole("button", { name: /Select date/i }).click();
  await page.waitForTimeout(300);
  const dobSelects = page.locator('select:visible');
  await dobSelects.nth(0).selectOption("06");
  await dobSelects.nth(1).selectOption("15");
  await dobSelects.nth(2).selectOption("2010");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForTimeout(300);

  await page.locator('input[name="teen-gender"][value="Male"]').click();
  await page.getByRole("button", { name: "Add Teen" }).click();
  await expect(page.getByText(`${teenFirstName} ${teenLastName}`)).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: "Continue to Registration" }).click();
  await expect(page.getByRole("heading", { name: `${teenFirstName} ${teenLastName}` })).toBeVisible({ timeout: 10000 });

  const toDocsBtn = page.getByRole("button", { name: "Next", exact: true });
  await expect(toDocsBtn).toBeVisible({ timeout: 5000 });
  await toDocsBtn.click();

  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

  // Seed required documents directly (see parent-registration-flow.spec.ts's
  // doc comment — driving the hidden file input fires a real UploadThing
  // call with no local token configured) so Next enables without a real
  // upload transport.
  const wizardData = await page.evaluate(() => sessionStorage.getItem("camply-registration-wizard"));
  const parsed = wizardData ? JSON.parse(wizardData) : null;
  const teen = parsed?.teens?.[0];
  if (teen && teen.registrationId) {
    const reqs = await prisma.documentRequirement.findMany({
      where: { campId: parsed.campData?.campId, required: true, deletedAt: null },
    });
    const parentUser = await prisma.user.findUniqueOrThrow({ where: { email: parentEmail } });
    for (const req of reqs) {
      const existing = await prisma.document.findFirst({
        where: {
          requirementId: req.id,
          ...(req.scope === "CAMPER" ? { camperId: teen.camperId } : { registrationId: teen.registrationId }),
          deletedAt: null,
        },
      });
      if (!existing) {
        await prisma.document.create({
          data: {
            requirementId: req.id,
            ...(req.scope === "CAMPER" ? { camperId: teen.camperId } : { registrationId: teen.registrationId }),
            url: `https://utfs.io/f/e2e-quota-doc-${Date.now()}.pdf`,
            fileName: "dummy-document.pdf",
            fileType: "application/pdf",
            fileSize: 1024,
            uploadedById: parentUser.id,
          },
        });
      }
    }
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: `${teenFirstName} ${teenLastName}` })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
  }

  const reviewBtn = page.getByRole("button", { name: "Next", exact: true });
  await expect(reviewBtn).toBeVisible({ timeout: 5000 });
  await expect(reviewBtn).toBeEnabled({ timeout: 10000 });
  await reviewBtn.click();

  await expect(page.getByRole("heading", { name: "Review Your Registration" })).toBeVisible({ timeout: 5000 });
  const checkboxes = page.locator('input[type="checkbox"]');
  const cbCount = await checkboxes.count();
  for (let i = 0; i < cbCount; i++) {
    await checkboxes.nth(i).check();
  }
  await page.getByRole("button", { name: "Submit Registration" }).click();
}

test.describe("Campus registration quota (SignupLink-scoped)", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const parentAEmail = `e2e-quota-parent-a-${stamp}@camply.test`;
  const parentBEmail = `e2e-quota-parent-b-${stamp}@camply.test`;
  const parentPassword = "password123";

  let organizationId: string;
  let campId: string;
  let closeCampusId: string;
  let closeSignupToken: string;
  let closeLinkId: string;
  let waitlistCampusId: string;
  let relaxedCustomFields: { id: string; required: boolean }[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    await resetSystemFieldDefaults("CAMPER");
    relaxedCustomFields = await relaxRequiredCustomFields("CAMPER");

    const closeCampus = await prisma.campus.create({
      data: {
        name: `E2E Quota Campus ${stamp}`,
        slug: `e2e-quota-campus-${stamp}`,
        address: "1 Quota St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    closeCampusId = closeCampus.id;

    const token = randomBytes(16).toString("hex");
    const link = await prisma.signupLink.create({
      data: { token, campusId: closeCampusId, campId, active: true, quota: 1, quotaFullBehavior: "CLOSE" },
    });
    closeLinkId = link.id;
    const campSlug = (await prisma.camp.findUniqueOrThrow({ where: { id: campId } })).slug;
    closeSignupToken = `${closeCampus.slug}_${campSlug}`;

    const waitlistCampus = await prisma.campus.create({
      data: {
        name: `E2E Quota Waitlist Campus ${stamp}`,
        slug: `e2e-quota-waitlist-campus-${stamp}`,
        address: "1 Waitlist St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    waitlistCampusId = waitlistCampus.id;
    await prisma.signupLink.create({
      data: {
        token: randomBytes(16).toString("hex"),
        campusId: waitlistCampusId,
        campId,
        active: true,
        quota: 1,
        quotaFullBehavior: "WAITLIST",
      },
    });
  });

  test.afterAll(async () => {
    await restoreRequiredCustomFields(relaxedCustomFields);
    await deleteCamperByEmail(parentAEmail);
    await deleteCamperByEmail(parentBEmail);
    await prisma.registration.deleteMany({ where: { campusId: { in: [closeCampusId, waitlistCampusId] } } });
    await prisma.signupLink.deleteMany({ where: { campusId: { in: [closeCampusId, waitlistCampusId] } } });
    await prisma.campus.deleteMany({ where: { id: { in: [closeCampusId, waitlistCampusId] } } });
  });

  test("fills the campus's only quota slot via the real registration wizard", async ({ page }) => {
    test.setTimeout(90000);
    await driveTeenToSubmit(page, {
      signupToken: closeSignupToken,
      parentEmail: parentAEmail,
      parentPassword,
      teenFirstName: "Quota",
      teenLastName: "First",
    });
    await expect(page.getByText("Registration Submitted")).toBeVisible({ timeout: 20000 });

    const camper = await prisma.camper.findFirstOrThrow({ where: { user: { email: parentAEmail } } });
    const registration = await prisma.registration.findFirstOrThrow({ where: { camperId: camper.id } });
    expect(["SUBMITTED", "PENDING", "APPROVED"]).toContain(registration.status);
  });

  test("a second parent sees 'Campus quota reached' once the campus is full", async ({ page }) => {
    test.setTimeout(90000);
    await driveTeenToSubmit(page, {
      signupToken: closeSignupToken,
      parentEmail: parentBEmail,
      parentPassword,
      teenFirstName: "Quota",
      teenLastName: "Second",
    });
    await expect(page.getByText(/Campus quota reached/i)).toBeVisible({ timeout: 15000 });

    const camper = await prisma.camper.findFirstOrThrow({ where: { user: { email: parentBEmail } } });
    const registration = await prisma.registration.findFirstOrThrow({ where: { camperId: camper.id } });
    expect(registration.status).toBe("DRAFT");
  });

  test("WAITLIST behavior: submission is not gated, approval waitlists the excess", async ({ page }) => {
    const password = await bcrypt.hash("password123", 10);
    async function makePendingRegistration(email: string, name: string) {
      const parent = await prisma.user.create({ data: { email, password, role: "PARENT", organizationId } });
      const camper = await prisma.camper.create({
        data: { name, userId: parent.id, organizationId, homeCampusId: waitlistCampusId },
      });
      const registration = await prisma.registration.create({
        data: { camperId: camper.id, campId, campusId: waitlistCampusId, status: "PENDING" },
      });
      return { parentId: parent.id, camperId: camper.id, registrationId: registration.id };
    }
    const first = await makePendingRegistration(`e2e-quota-wl-a-${stamp}@camply.test`, "Quota WL First");
    const second = await makePendingRegistration(`e2e-quota-wl-b-${stamp}@camply.test`, "Quota WL Second");

    await loginWithPassword(page, "admin@camply.com", "password123");
    const approve = async (id: string) => {
      const res = await page.request.post("/api/trpc/registration.approve?batch=1", {
        data: { "0": { json: { registrationId: id } } },
        headers: { "Content-Type": "application/json" },
      });
      expect(res.ok()).toBe(true);
    };
    await approve(first.registrationId);
    await approve(second.registrationId);

    const r1 = await prisma.registration.findUniqueOrThrow({ where: { id: first.registrationId } });
    const r2 = await prisma.registration.findUniqueOrThrow({ where: { id: second.registrationId } });
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(["APPROVED", "WAITLISTED"]);

    await prisma.registration.deleteMany({ where: { id: { in: [first.registrationId, second.registrationId] } } });
    await prisma.camper.deleteMany({ where: { id: { in: [first.camperId, second.camperId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [first.parentId, second.parentId] } } });
  });

  test("admin raises the quota mid-campaign via the Set Quota dialog; the previously-blocked parent can now submit", async ({ page }) => {
    // owner@camply.com is used here (not admin@camply.com) to match this
    // repo's established Playwright convention for /admin/campuses — that
    // page's campus.getByOrganization query requires either OWNER/SUPER_ADMIN
    // role or an explicit READ_CAMPUS/UPDATE_CAMPUS permission grant for
    // ADMIN, which the seeded admin@camply.com fixture doesn't have (see
    // campus-crud.spec.ts, which uses owner@camply.com for the same reason).
    // signupLink.updateQuota itself still permits ADMIN — this is purely a
    // fixture-account limitation on this one page's list query.
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await showAllRows(page);

    const row = page.locator("tr", { hasText: `E2E Quota Campus ${stamp}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole("button", { name: "Set Quota" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Set Campus Quota" })).toBeVisible({ timeout: 5000 });
    await dialog.getByLabel("Registration Quota (0 = unlimited)").fill("2");
    await dialog.getByRole("button", { name: "Save Quota" }).click();
    await expect(page.getByText("Quota updated successfully!")).toBeVisible({ timeout: 10000 });

    const updatedLink = await prisma.signupLink.findUniqueOrThrow({ where: { id: closeLinkId } });
    expect(updatedLink.quota).toBe(2);

    // Parent B's teen is still DRAFT from the earlier blocked attempt —
    // submit it now that there's room.
    await loginWithPassword(page, parentBEmail, parentPassword);
    const camper = await prisma.camper.findFirstOrThrow({ where: { user: { email: parentBEmail } } });
    const registration = await prisma.registration.findFirstOrThrow({ where: { camperId: camper.id } });

    const res = await page.request.post("/api/trpc/registration.submit?batch=1", {
      data: { "0": { json: { registrationId: registration.id } } },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body[0]?.error).toBeUndefined();

    const reloaded = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(["SUBMITTED", "PENDING", "APPROVED"]).toContain(reloaded.status);
  });

  test("lowering the quota below the number of already-approved registrations is refused", async ({ page }) => {
    const camperA = await prisma.camper.findFirstOrThrow({ where: { user: { email: parentAEmail } } });
    const regA = await prisma.registration.findFirstOrThrow({ where: { camperId: camperA.id } });
    const camperB = await prisma.camper.findFirstOrThrow({ where: { user: { email: parentBEmail } } });
    const regB = await prisma.registration.findFirstOrThrow({ where: { camperId: camperB.id } });
    await prisma.registration.updateMany({ where: { id: { in: [regA.id, regB.id] } }, data: { status: "APPROVED" } });

    await loginWithPassword(page, "admin@camply.com", "password123");
    const res = await page.request.post("/api/trpc/signupLink.updateQuota?batch=1", {
      data: { "0": { json: { id: closeLinkId, quota: 1 } } },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body[0]?.error?.json?.message).toContain("cannot be less than");

    const link = await prisma.signupLink.findUniqueOrThrow({ where: { id: closeLinkId } });
    expect(link.quota).toBe(2); // unchanged from the prior raise
  });
});
