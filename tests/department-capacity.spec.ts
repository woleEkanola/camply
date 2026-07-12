import { test, expect } from "@playwright/test";
import {
  prisma,
  getFixtureOrgContext,
  ensureStaffSignupLink,
  waitForOtp,
  loginWithPassword,
  deleteStaffByEmail,
  resetSystemFieldDefaults,
} from "./helpers";

test.describe("Department capacity ('quota') for camp-role signup", () => {
  test.describe.configure({ mode: "serial" });

  let departmentId: string;
  let departmentName: string;
  const emailA = `e2e-dept-cap-a-${Date.now()}@camply.test`;
  const emailB = `e2e-dept-cap-b-${Date.now()}@camply.test`;
  const emailAdmin = `e2e-dept-cap-admin-${Date.now()}@camply.test`;

  test.beforeAll(async () => {
    await resetSystemFieldDefaults("VOLUNTEER");
    const { organizationId, campId } = await getFixtureOrgContext();
    departmentName = `E2E Capacity Dept ${Date.now()}`;
    const dept = await prisma.department.create({
      data: { organizationId, campId, name: departmentName, maxCapacity: 1 },
    });
    departmentId = dept.id;
  });

  test.afterAll(async () => {
    await deleteStaffByEmail(emailA);
    await deleteStaffByEmail(emailB);
    await deleteStaffByEmail(emailAdmin);
    await prisma.department.deleteMany({ where: { id: departmentId } });
  });

  test("wizard signup fills the department's one slot", async ({ page }) => {
    const token = await ensureStaffSignupLink("VOLUNTEER");
    await page.goto(`/register/volunteers/${token}`);
    await expect(page.getByRole("heading", { name: "Volunteer Registration" })).toBeVisible();

    await page.getByLabel("Email Address").fill(emailA);
    await page.getByRole("button", { name: "Send Code" }).click();
    await expect(page.getByLabel("Verification Code")).toBeVisible({ timeout: 10000 });
    const code = await waitForOtp(emailA);
    await page.getByLabel("Verification Code").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });
    await page.getByLabel("First Name").fill("Capacity");
    await page.getByLabel("Last Name").fill("First");
    await page.getByLabel("Phone Number").fill("+1-555-0301");
    await page.getByLabel("Volunteer Category").selectOption("Kitchen");
    await expect(page.getByLabel("Camp Department")).toContainText(departmentName);
    await page.getByLabel("Camp Department").selectOption({ label: departmentName });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Review & Submit")).toBeVisible();
    await page.getByRole("button", { name: "Submit Registration" }).click();
    await expect(page.getByText("Registration submitted")).toBeVisible({ timeout: 10000 });

    const profile = await prisma.staffProfile.findFirst({ where: { email: emailA } });
    expect(profile?.departmentId).toBe(departmentId);
  });

  test("a second applicant no longer sees the full department in the dropdown, and the server rejects a forced submission", async ({ page }) => {
    const token = await ensureStaffSignupLink("VOLUNTEER");
    await page.goto(`/register/volunteers/${token}`);

    await page.getByLabel("Email Address").fill(emailB);
    await page.getByRole("button", { name: "Send Code" }).click();
    await expect(page.getByLabel("Verification Code")).toBeVisible({ timeout: 10000 });
    const code = await waitForOtp(emailB);
    await page.getByLabel("Verification Code").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });
    // The department is full — its option must be absent from the live dropdown.
    const options = await page.getByLabel("Camp Department").locator("option").allTextContents();
    expect(options.join(" ")).not.toContain(departmentName);

    // Forcing the field via a direct API call (bypassing the UI, as a
    // concurrent-race client would) must still be rejected server-side.
    const res = await page.request.post("/api/staff/register", {
      data: {
        token,
        email: emailB,
        firstName: "Capacity",
        lastName: "Second",
        phone: "+1-555-0302",
        volunteerCategory: "Kitchen",
        departmentId,
        fieldValues: [],
      },
    });
    expect(res.status()).toBe(409);

    const profile = await prisma.staffProfile.findFirst({ where: { email: emailB } });
    expect(profile).toBeNull();

    const countAfter = await prisma.staffProfile.count({
      where: { departmentId, status: { in: ["PENDING", "APPROVED"] }, deletedAt: null },
    });
    expect(countAfter).toBe(1);
  });

  test("admin's manual Add Volunteer dialog still shows the full department, labeled, and can override it", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/volunteers");

    await page.getByRole("button", { name: "+ Add Volunteer" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email Address").fill(emailAdmin);
    await dialog.getByLabel("First Name").fill("Capacity");
    await dialog.getByLabel("Last Name").fill("Admin");

    const deptSelect = dialog.getByLabel("Camp Department");
    const options = await deptSelect.locator("option").allTextContents();
    expect(options.join(" ")).toContain(`${departmentName} (Full)`);
    await deptSelect.selectOption({ label: `${departmentName} (Full)` });

    await dialog.getByRole("button", { name: "Add Profile" }).click();
    await expect(page.getByText("manual profile created successfully")).toBeVisible({ timeout: 10000 });

    const profile = await prisma.staffProfile.findFirst({ where: { email: emailAdmin } });
    expect(profile?.departmentId).toBe(departmentId);

    const countAfter = await prisma.staffProfile.count({
      where: { departmentId, status: { in: ["PENDING", "APPROVED"] }, deletedAt: null },
    });
    expect(countAfter).toBe(2);
  });
});
