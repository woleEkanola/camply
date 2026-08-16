import { test, expect } from "@playwright/test";
import {
  prisma,
  getFixtureOrgContext,
  ensureStaffSignupLink,
  waitForOtp,
  deleteStaffByEmail,
  resetSystemFieldDefaults,
  fillOtpGrid,
} from "./helpers";

/**
 * Regression test for the reported "system creates duplicate registrations"
 * bug (Part B, [[project_organogram_camp_command_overhaul]]-adjacent work).
 * `POST /api/staff/register` used to check "already registered?" with a
 * `findFirst` well outside any transaction, so concurrent submits (a
 * double-click, a retry, a slow connection firing twice) could both pass the
 * check and both insert. The fix moves the check inside the create
 * transaction and adds a P2002 catch as a backstop — this fires ~6
 * concurrent requests on one authenticated session and asserts exactly one
 * profile is created, the rest gracefully return the "already registered"
 * 200, and nothing 500s.
 *
 * Gated on the protective partial unique index actually being present on
 * this database — see registerGuards.ts. Without the index there is no
 * backstop at all (a known gap on at least one of this repo's local
 * databases), so the race would legitimately create duplicates; skip with an
 * explicit message instead of failing for the wrong reason.
 */
test.describe("Staff registration: concurrent-submit duplicate race", () => {
  test.setTimeout(60_000);

  const email = `e2e-staffrace-${Date.now()}@camply.test`;

  test.afterAll(async () => {
    await deleteStaffByEmail(email);
  });

  test("fires ~6 concurrent registration POSTs from one session and only one profile survives", async ({ page }) => {
    const indexRows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'StaffProfile' AND indexname = 'StaffProfile_userId_campId_key'
    `;
    test.skip(indexRows.length === 0, "StaffProfile_userId_campId_key is missing on this database — no backstop exists for this race here.");

    await resetSystemFieldDefaults("TEACHER");
    const { campId } = await getFixtureOrgContext();
    const token = await ensureStaffSignupLink("TEACHER");

    // Establish a real authenticated session the same way the wizard does
    // (OTP verify → next-auth signIn), so page.request shares its cookie.
    await page.goto(`/register/teachers/${token}`);
    await expect(page.getByRole("heading", { name: "Teacher Registration" })).toBeVisible();
    await page.getByRole("button", { name: "Email OTP" }).click();
    await page.getByLabel("Email Address").fill(email);
    await page.getByRole("button", { name: "Send Code" }).click();
    await expect(page.getByLabel("Digit 1 of 6")).toBeVisible({ timeout: 10000 });
    const code = await waitForOtp(email);
    await fillOtpGrid(page, code);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });

    const body = {
      token,
      email,
      firstName: "Race",
      lastName: "Condition",
      phone: `080${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`,
      fieldValues: [],
    };

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => page.request.post("/api/staff/register", { data: body }))
    );

    const statuses = responses.map((r) => r.status());
    expect(statuses.filter((s) => s >= 500).length).toBe(0);
    expect(statuses.filter((s) => s === 201).length).toBe(1);
    expect(statuses.filter((s) => s === 200).length).toBe(5);

    const bodies = await Promise.all(responses.map((r) => r.json()));
    const staffProfileIds = new Set(bodies.map((b) => b.staffProfileId));
    expect(staffProfileIds.size).toBe(1);

    const liveCount = await prisma.staffProfile.count({
      where: { email, campId, deletedAt: null },
    });
    expect(liveCount).toBe(1);
  });
});
