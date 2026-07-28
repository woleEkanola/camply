import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import {
  prisma,
  getFixtureOrgContext,
  ensureStaffSignupLink,
  waitForOtp,
  fillOtpGrid,
  resetSystemFieldDefaults,
  loginWithPassword,
} from "./helpers";

// Shares the seeded org's staff signup link and system fields.
test.describe.configure({ mode: "serial" });

/**
 * A person is often both a parent and a teacher — the parents most involved in
 * a camp are frequently the ones serving at it. This used to be impossible:
 * one email = one User = one `role`, and the staff signup flow 409'd on a known
 * email ("already registered with a different account type"), forcing
 * parent-teachers to invent a second address.
 *
 * `User.role` is now the *primary* role (default dashboard) and staff/parent
 * are capabilities derived from `staffProfiles` / `campers`, which were already
 * arrays on User. See src/server/auth/capabilities.ts.
 */
test.describe("Parent + Teacher on one account", () => {
  test.beforeAll(async () => {
    await resetSystemFieldDefaults("TEACHER");
  });

  test("an existing PARENT can register as a teacher on the same email, and keeps access to their own camper", async ({
    page,
  }) => {
    const email = `e2e-dual-${Date.now()}@camply.test`;
    const { organizationId, campId, campusId } = await getFixtureOrgContext();
    let parentId = "";

    try {
      // ── Given: a real parent account with a camper and a registration ──
      const parent = await prisma.user.create({
        data: {
          email,
          password: await bcrypt.hash("password123", 10),
          role: "PARENT",
          organizationId,
          active: true,
        },
      });
      parentId = parent.id;

      const camper = await prisma.camper.create({
        data: {
          name: "Dual Role Camper",
          firstName: "Dual",
          lastName: "Camper",
          gender: "Male",
          dateOfBirth: new Date(2013, 5, 1),
          userId: parent.id,
          organizationId,
          homeCampusId: campusId,
        },
      });
      await prisma.registration.create({
        data: {
          camperId: camper.id,
          campId,
          campusId,
          status: "PENDING",
          registrationNumber: `REG-DUAL-${Date.now()}`,
        },
      });

      // ── When: they go through the teacher signup with the SAME email ──
      const token = await ensureStaffSignupLink("TEACHER");
      await page.goto(`/register/teachers/${token}`);
      await expect(page.getByRole("heading", { name: "Teacher Registration" })).toBeVisible();

      await page.getByRole("button", { name: "Email OTP" }).click();
      await page.getByLabel("Email Address").fill(email);
      await page.getByRole("button", { name: "Send Code" }).click();

      // The whole point: this used to fail here with a 409.
      await expect(page.getByText(/already registered with a different account type/i)).toHaveCount(0);
      await expect(page.getByLabel("Digit 1 of 6")).toBeVisible({ timeout: 10000 });

      await fillOtpGrid(page, await waitForOtp(email));
      await page.getByRole("button", { name: "Verify" }).click();

      await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });
      await page.getByLabel("First Name").fill("Dual");
      await page.getByLabel("Last Name").fill("Teacher");
      await page.getByLabel("Phone Number").fill("+1-555-0199");
      await page.getByRole("button", { name: "Teaching", exact: true }).click();
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(page.getByRole("heading", { name: "Review Your Details" })).toBeVisible();
      await page.getByRole("button", { name: "Submit Registration" }).click();
      await expect(page.getByText("Registration submitted")).toBeVisible({ timeout: 15000 });

      // ── Then: a staff profile exists on the SAME user ──
      const profile = await prisma.staffProfile.findFirst({ where: { email } });
      expect(profile).not.toBeNull();
      expect(profile?.type).toBe("TEACHER");
      expect(profile?.userId).toBe(parent.id);

      // ── And: no second account was created, and their primary role is intact ──
      const users = await prisma.user.findMany({ where: { email } });
      expect(users).toHaveLength(1);
      expect(users[0]?.role).toBe("PARENT");

      // ── And: they still own their camper (the capability didn't displace it) ──
      const stillOwned = await prisma.camper.findFirst({
        where: { id: camper.id, userId: parent.id },
      });
      expect(stillOwned).not.toBeNull();
    } finally {
      await prisma.registration.deleteMany({ where: { camper: { userId: parentId } } });
      await prisma.staffFieldValue.deleteMany({ where: { staffProfile: { email } } });
      await prisma.staffProfile.deleteMany({ where: { email } });
      await prisma.camper.deleteMany({ where: { userId: parentId } });
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  test("password signup on an existing email is still refused, and says why", async ({ page }) => {
    // Deliberate: a submitted password proves nothing about who owns the
    // existing account, so this path must not attach a capability. Only the
    // OTP path (which proves inbox control) may.
    const email = `e2e-dual-pw-${Date.now()}@camply.test`;
    try {
      await prisma.user.create({
        data: {
          email,
          password: await bcrypt.hash("password123", 10),
          role: "PARENT",
          organizationId: (await getFixtureOrgContext()).organizationId,
          active: true,
        },
      });

      const res = await page.request.post("/api/base-user/signup", {
        data: { email, password: "password123", role: "PARENT" },
      });
      expect(res.status()).toBe(400);
      expect((await res.json()).message).toMatch(/already have a Camply account/i);
    } finally {
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  test("an anonymous caller cannot attach a staff profile to someone else's email", async ({ page }) => {
    // Security: removing the old role check must not open a takeover hole.
    // /api/staff/register requires a session matching the email.
    const email = `e2e-dual-victim-${Date.now()}@camply.test`;
    try {
      await prisma.user.create({
        data: {
          email,
          password: await bcrypt.hash("password123", 10),
          role: "PARENT",
          organizationId: (await getFixtureOrgContext()).organizationId,
          active: true,
        },
      });

      const token = await ensureStaffSignupLink("TEACHER");
      const res = await page.request.post("/api/staff/register", {
        data: { token, email, firstName: "Mal", lastName: "Actor", phone: "+1-555-0000" },
      });

      expect(res.status()).toBe(401);
      expect(await prisma.staffProfile.findFirst({ where: { email } })).toBeNull();
    } finally {
      await prisma.staffProfile.deleteMany({ where: { email } });
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  test("the switcher appears only for someone with more than one context", async ({ page }) => {
    const { organizationId, campId, campusId } = await getFixtureOrgContext();
    const dualEmail = `e2e-dual-switch-${Date.now()}@camply.test`;
    const soloEmail = `e2e-solo-switch-${Date.now()}@camply.test`;
    const password = "password123";
    let dualId = "";
    let soloId = "";

    try {
      const hashed = await bcrypt.hash(password, 10);

      // A parent who is also an APPROVED teacher — two contexts.
      const dual = await prisma.user.create({
        data: { email: dualEmail, password: hashed, role: "PARENT", organizationId, active: true },
      });
      dualId = dual.id;
      await prisma.camper.create({
        data: {
          name: "Switch Camper", firstName: "Switch", lastName: "Camper", gender: "Male",
          dateOfBirth: new Date(2013, 5, 1), userId: dual.id, organizationId, homeCampusId: campusId,
        },
      });
      await prisma.staffProfile.create({
        data: {
          userId: dual.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
          firstName: "Switch", lastName: "Teacher", phone: "+1-555-0123", email: dualEmail,
        },
      });

      // A plain parent — one context.
      const solo = await prisma.user.create({
        data: { email: soloEmail, password: hashed, role: "PARENT", organizationId, active: true },
      });
      soloId = solo.id;
      await prisma.camper.create({
        data: {
          name: "Solo Camper", firstName: "Solo", lastName: "Camper", gender: "Male",
          dateOfBirth: new Date(2013, 5, 1), userId: solo.id, organizationId, homeCampusId: campusId,
        },
      });

      // Dual: switcher present, and both areas reachable.
      await loginWithPassword(page, dualEmail, password);
      await page.goto("/dashboard");
      const switcher = page.getByRole("button", { name: "Switch context" });
      await expect(switcher).toBeVisible({ timeout: 15000 });

      await switcher.click();
      // HeadlessUI's Menu.Item exposes role=menuitem, not link — and "Teacher"
      // also appears in page content, so scope to the open menu.
      await page.getByRole("menu").getByRole("menuitem", { name: "Teacher", exact: true }).click();
      await expect(page).toHaveURL(/\/teacher/, { timeout: 15000 });

      // Solo: no switcher at all.
      await page.goto("/api/auth/signout");
      await loginWithPassword(page, soloEmail, password);
      await page.goto("/dashboard");
      await expect(page.locator("header").first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("button", { name: "Switch context" })).toHaveCount(0);
    } finally {
      await prisma.staffProfile.deleteMany({ where: { email: dualEmail } });
      await prisma.camper.deleteMany({ where: { userId: { in: [dualId, soloId].filter(Boolean) } } });
      await prisma.user.deleteMany({ where: { email: { in: [dualEmail, soloEmail] } } });
    }
  });
});
