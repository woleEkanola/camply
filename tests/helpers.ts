import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import type { Page } from "@playwright/test";

// Shared across specs — Playwright runs each test file in its own worker
// process, so this is one connection per worker, not per test.
export const prisma = new PrismaClient();

/**
 * The stable fixture organization tied to the seeded admin@camply.com /
 * owner@camply.com / locationadmin@camply.com credentials (see CLAUDE.md's
 * "Test login credentials" table). NOTE: despite the name in prisma/seed.ts,
 * `npm run seed` creates an org called "Demo Organization" — but that has
 * never actually been run against this local DB; the real fixture org these
 * accounts belong to is whatever admin@camply.com's organizationId resolves
 * to. Resolve by that account rather than by org name so this keeps working
 * regardless of what the org is actually called.
 */
export async function getFixtureOrgContext() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
  if (!admin.organizationId) throw new Error("admin@camply.com has no organizationId — check seed data.");
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: admin.organizationId } });
  if (!organization.activeYearId) throw new Error("Fixture organization has no active year — check seed data.");
  const location = await prisma.location.findFirstOrThrow({ where: { organizationId: organization.id } });
  return { organizationId: organization.id, yearId: organization.activeYearId, locationId: location.id, locationName: location.name };
}

/** Idempotent — reuses an existing active link for (year, type) or creates one, mirroring staffSignupLink.generate. */
export async function ensureStaffSignupLink(type: "TEACHER" | "VOLUNTEER") {
  const { organizationId, yearId } = await getFixtureOrgContext();
  const existing = await prisma.staffSignupLink.findUnique({ where: { yearId_type: { yearId, type } } });
  if (existing) {
    if (!existing.active) await prisma.staffSignupLink.update({ where: { id: existing.id }, data: { active: true } });
    return existing.token;
  }
  const token = randomBytes(16).toString("hex");
  await prisma.staffSignupLink.create({ data: { token, type, yearId, organizationId, active: true } });
  return token;
}

/** Polls the OTP table for a code — the UI triggers OTP creation via a fetch call with no visible confirmation, and no email actually arrives locally (no RESEND_API_KEY configured), so tests read the code directly from where the app persists it. */
export async function waitForOtp(email: string, timeoutMs = 10000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const otp = await prisma.oTP.findUnique({ where: { email } });
    if (otp) return otp.code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No OTP appeared for ${email} within ${timeoutMs}ms`);
}

/** Deletes a StaffProfile + its User by email — cleans up a test run so re-runs start fresh. */
export async function deleteStaffByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.staffProfile.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

export function emailInput(page: Page) {
  return page.locator('input[placeholder="Enter your email"]:visible');
}
export function nextButton(page: Page) {
  return page.locator('button:visible', { hasText: "Next" });
}
export function passwordInput(page: Page) {
  return page.locator('input[placeholder="Enter Password"]:visible');
}
export function loginButton(page: Page) {
  return page.locator('button:visible', { hasText: "Login" });
}

/**
 * The Input/Select/Textarea primitives (src/components/ui/Input.tsx) only
 * link <label> to its field via `htmlFor`/`id` when an explicit `id` or
 * `name` prop is passed — most call sites (including every step of the
 * staff RegistrationWizard) omit both, so there is no accessible-name
 * association for `getByLabel` to find. Locate by walking from the label
 * text to its form control instead. Two shapes occur in practice:
 *  - label and field are direct siblings inside the same wrapper div
 *    (e.g. RegistrationWizard, which passes `label` into the primitive).
 *  - a plain hand-written <label> sits next to a <Select>/<Input> used
 *    *without* its own `label` prop, so the field is nested one level
 *    deeper inside that component's own wrapper div (e.g.
 *    StaffDetailDrawer's Centre/Department/Reports To fields).
 * The XPath union below matches either shape.
 */
export function fieldByLabel(page: Page, labelText: string) {
  return page
    .locator("label", { hasText: labelText })
    .locator(
      "xpath=following-sibling::*[1][self::input or self::textarea or self::select] | following-sibling::*[1]//*[self::input or self::textarea or self::select]"
    )
    .first();
}

/** Logs in via the password flow (SUPER_ADMIN/OWNER/ADMIN/LOCATION_ADMIN) and waits for the post-login redirect. */
export async function loginWithPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  await emailInput(page).fill(email);
  await nextButton(page).click();
  await passwordInput(page).fill(password);
  await loginButton(page).click();
  await page.waitForURL(/\/(admin|dashboard|super-admin|location-admin-dashboard)/, { timeout: 15000 });
}

/** Logs in via the OTP flow (TEACHER/VOLUNTEER/BASE_USER) using /reg-login/verify-otp, reading the code from the DB — the user must already exist (e.g. created directly via Prisma as a test fixture). */
export async function loginWithOtp(page: Page, email: string) {
  await page.request.post("/api/base-user/send-otp", { data: { email } });
  const code = await waitForOtp(email);
  await page.goto("/reg-login/verify-otp");
  await page.locator("#email").fill(email);
  await page.locator("#otp").fill(code);
  await page.locator('button:visible', { hasText: "Verify OTP" }).click();
}
