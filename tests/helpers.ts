import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import type { Page } from "@playwright/test";
import { ensureSystemFields, SYSTEM_FIELD_REGISTRY } from "../src/server/registration/systemFieldRegistry";

// Shared across specs — Playwright runs each test file in its own worker
// process, so this is one connection per worker, not per test.
export const prisma = new PrismaClient();

/**
 * `formField.list` lazily seeds an org's SYSTEM fields on first read — a
 * wizard page load triggers this naturally, but a test that queries
 * FormField directly via Prisma before any page has loaded can't assume
 * those rows exist yet. Call this first when a test needs to read/mutate a
 * known SYSTEM field (e.g. "church") without driving a browser page load.
 */
export async function ensureFormFields(audience: "CAMPER" | "TEACHER" | "VOLUNTEER") {
  const { organizationId } = await getFixtureOrgContext();
  await ensureSystemFields(prisma, organizationId, audience);
}

/**
 * Temporarily clears the `required` flag on the shared fixture org's visible
 * CUSTOM FormFields for `audience`, returning a snapshot to restore afterward.
 * The full end-to-end submit flow can't complete while an org-specific required
 * custom field it doesn't know how to fill (e.g. an admin-added "Teens HOD
 * name") gates submission. This is reversible and never deletes admin data —
 * pair it with restoreRequiredCustomFields() in afterAll.
 */
export async function relaxRequiredCustomFields(
  audience: "CAMPER" | "TEACHER" | "VOLUNTEER"
): Promise<{ id: string; required: boolean }[]> {
  const { organizationId } = await getFixtureOrgContext();
  const fields = await prisma.formField.findMany({
    where: { organizationId, audience, source: "CUSTOM", required: true, deletedAt: null },
    select: { id: true, required: true },
  });
  if (fields.length > 0) {
    await prisma.formField.updateMany({
      where: { id: { in: fields.map((f) => f.id) } },
      data: { required: false },
    });
  }
  return fields;
}

/** Restores `required` flags cleared by relaxRequiredCustomFields(). */
export async function restoreRequiredCustomFields(snapshot: { id: string; required: boolean }[]) {
  for (const s of snapshot) {
    await prisma.formField.updateMany({ where: { id: s.id }, data: { required: s.required } });
  }
}

/**
 * Realigns the shared fixture org's SYSTEM FormFields for `audience` back to
 * the canonical defaults in systemFieldRegistry.ts (visible / required /
 * sortOrder / groupLabel). Prior sessions' Form Editor edits accumulate on
 * this shared org and drift these flags — e.g. a `photoUrl` left visible splits
 * "Personal Information" into two non-contiguous section headers, or a hidden
 * camper `name` field makes "Full Name" disappear — which breaks the data-driven
 * wizard specs in ways that have nothing to do with the code under test. Call
 * this in a spec's beforeAll so it renders the wizard against a known baseline.
 * Only touches SYSTEM fields; admin-defined CUSTOM fields are left alone.
 */
export async function resetSystemFieldDefaults(audience: "CAMPER" | "TEACHER" | "VOLUNTEER") {
  const { organizationId } = await getFixtureOrgContext();
  await ensureSystemFields(prisma, organizationId, audience);
  const defaults = SYSTEM_FIELD_REGISTRY[audience];
  await prisma.$transaction(
    defaults.map((f) =>
      prisma.formField.updateMany({
        where: { organizationId, audience, source: "SYSTEM", name: f.name },
        data: { visible: f.visible, required: f.required, sortOrder: f.sortOrder, groupLabel: f.groupLabel },
      })
    )
  );
}

/** Selects "100 / page" on the shared Table component's page-size control (only rendered once there's more than one page), so newly-created rows appended at the end of a long list are actually visible. Call before opening any Dialog on the same page — the plain `select` locator isn't scoped and would otherwise also match a select inside an open dialog. */
export async function showAllRows(page: Page) {
  const sizeSelect = page.locator('select:has(option[value="100"])');
  try {
    // count() doesn't auto-wait — the table's data query may still be in
    // flight right after a tab switch, so give the paginator time to mount
    // before concluding there's nothing to page through.
    await sizeSelect.waitFor({ state: "visible", timeout: 5000 });
    await sizeSelect.selectOption("100");
  } catch {
    // 10 or fewer rows — no paginator rendered, nothing to do.
  }
}

/**
 * The stable fixture organization tied to the seeded admin@camply.com /
 * owner@camply.com / campusrep@camply.com credentials (see CLAUDE.md's
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
  if (!organization.activeCampId) throw new Error("Fixture organization has no active camp — check seed data.");
  const campus = await prisma.campus.findFirstOrThrow({ where: { organizationId: organization.id } });
  const venue = await prisma.venue.findFirstOrThrow({ where: { campId: organization.activeCampId } });
  return {
    organizationId: organization.id,
    campId: organization.activeCampId,
    campusId: campus.id,
    campusName: campus.name,
    venueId: venue.id,
    venueName: venue.name,
  };
}

/** Idempotent — reuses an existing active link for (camp, type) or creates one, mirroring staffSignupLink.generate. */
export async function ensureStaffSignupLink(type: "TEACHER" | "VOLUNTEER") {
  const { organizationId, campId } = await getFixtureOrgContext();
  const existing = await prisma.staffSignupLink.findUnique({ where: { campId_type: { campId, type } } });
  if (existing) {
    if (!existing.active) await prisma.staffSignupLink.update({ where: { id: existing.id }, data: { active: true } });
    return existing.token;
  }
  const token = randomBytes(16).toString("hex");
  await prisma.staffSignupLink.create({ data: { token, type, campId, organizationId, active: true } });
  return token;
}

/** Idempotent — reuses an existing active SignupLink for the fixture (campus, camp) or creates one. */
export async function ensureCamperSignupLink() {
  const { campId, campusId } = await getFixtureOrgContext();
  const existing = await prisma.signupLink.findUnique({ where: { campusId_campId: { campusId, campId } } });
  if (existing) {
    if (!existing.active) await prisma.signupLink.update({ where: { id: existing.id }, data: { active: true } });
    return existing.token;
  }
  const token = randomBytes(16).toString("hex");
  await prisma.signupLink.create({ data: { token, campusId, campId, active: true } });
  return token;
}

/** Deletes a PARENT + any Campers by email — cleans up a test run so re-runs start fresh. */
export async function deleteCamperByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const profiles = await prisma.camper.findMany({ where: { userId: user.id } });
  for (const profile of profiles) {
    await prisma.registration.deleteMany({ where: { camperId: profile.id } });
  }
  await prisma.camper.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
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

/** Logs in via the password flow (SUPER_ADMIN/OWNER/ADMIN/CAMPUS_REPRESENTATIVE) and waits for the post-login redirect. */
export async function loginWithPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('button:visible', { hasText: "Password" }).first().click();
  await emailInput(page).fill(email);
  await passwordInput(page).fill(password);
  await loginButton(page).click();
  await page.waitForURL(/\/(admin|dashboard|super-admin|campus-rep-dashboard)/, { timeout: 15000 });
}

/** Logs in via the OTP flow (TEACHER/VOLUNTEER/PARENT) using /reg-login/verify-otp, reading the code from the DB — the user must already exist (e.g. created directly via Prisma as a test fixture). */
export async function loginWithOtp(page: Page, email: string) {
  await page.request.post("/api/base-user/send-otp", { data: { email } });
  const code = await waitForOtp(email);
  await page.goto("/reg-login/verify-otp");
  await page.locator("#email").fill(email);
  await page.locator("#otp").fill(code);
  await page.locator('button:visible', { hasText: "Verify OTP" }).click();
}
