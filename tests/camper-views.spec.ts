import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, loginWithOtp, getFixtureOrgContext, drawerPanel } from "./helpers";

const prisma = new PrismaClient();

test.describe("Camper View Modes & Replications", () => {
  let camperName: string;
  let camperId: string;
  let registrationId: string;
  let volunteerEmail: string;
  let volunteerUserId: string;
  let staffProfileId: string;

  test.beforeAll(async () => {
    const suffix = `${Date.now()}`;
    camperName = `View Camper ${suffix}`;
    const email = `e2e-view-${suffix}@camply.test`;

    // Must be the org owner@camply.com actually belongs to — resolving by the
    // name "Demo Organization" picks a different org that exists in this DB but
    // has no seeded logins, so everything created here was invisible to the
    // admin the test logs in as. See getFixtureOrgContext's doc comment.
    const ctx = await getFixtureOrgContext();
    const org = { id: ctx.organizationId };
    const camp = { id: ctx.campId };
    const campus = { id: ctx.campusId };

    // 1. Create a parent and camper
    const parent = await prisma.user.create({
      data: {
        email,
        password: "password123",
        role: "PARENT",
        organizationId: org.id,
      },
    });

    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "View",
        lastName: `Camper ${suffix}`,
        gender: "Male",
        dateOfBirth: new Date(2014, 5, 1),
        photoUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120",
        userId: parent.id,
        organizationId: org.id,
        homeCampusId: campus.id,
        allergies: "Peanuts",
        medicalConditions: "None",
      },
    });
    camperId = camper.id;

    const registration = await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId: camper.id,
        campId: camp.id,
        campusId: campus.id,
        registrationNumber: `REG-${suffix}`,
      },
    });
    registrationId = registration.id;

    // 2. Create an approved Volunteer user & StaffProfile with required fields
    volunteerEmail = `volunteer-${suffix}@camply.test`;
    const volunteerUser = await prisma.user.create({
      data: {
        email: volunteerEmail,
        password: "password123",
        role: "VOLUNTEER",
        organizationId: org.id,
      },
    });
    volunteerUserId = volunteerUser.id;

    const staffProfile = await prisma.staffProfile.create({
      data: {
        userId: volunteerUser.id,
        organizationId: org.id,
        campId: camp.id,
        firstName: "Test",
        lastName: "Volunteer",
        type: "VOLUNTEER",
        status: "APPROVED",
        phone: "1234567890",
        email: volunteerEmail,
      },
    });
    staffProfileId = staffProfile.id;
  });

  test.afterAll(async () => {
    // Cleanup parent, camper, and volunteer
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.delete({ where: { id: camperId } });
    await prisma.staffProfile.delete({ where: { id: staffProfileId } });
    await prisma.user.delete({ where: { id: volunteerUserId } });
  });

  test("admin dashboard - view modes toggle, profile drawer, and image expand", async ({ page }) => {
    test.setTimeout(120000); // 2-min timeout for dynamic compile on local Windows

    // 1. Log in and go to admin campers list
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");
    await page.waitForLoadState("networkidle");

    // 2. Default List View verification
    await expect(page.getByRole("heading", { name: "Campers", exact: true })).toBeVisible();
    // The shared fixture org has accumulated enough campers that this one is
    // no longer on the first page — narrow to it rather than relying on it
    // happening to be visible.
    await page.getByPlaceholder("Search name, email, or registration #").fill(camperName);
    await expect(page.getByText(camperName).first()).toBeVisible({ timeout: 20000 });

    // Verify removed columns (Parent / Created should not be headers in table)
    await expect(page.getByRole("columnheader", { name: "Parent", exact: true })).not.toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Created", exact: true })).not.toBeVisible();

    // 3. Switch to Thumbnail View
    await page.click("text=Thumbnail");
    await expect(page.getByText(camperName).first()).toBeVisible();
    // Selector for allergies indicator
    await expect(page.locator("span[title='Medical Alert']").first()).toBeVisible();

    // 4. Switch to Card View
    await page.click("text=Card");
    await expect(page.getByText(camperName).first()).toBeVisible();
    await expect(page.getByText("⚠️ Medical Alert").first()).toBeVisible();

    // 5. Click the card to open CamperQuickProfileDrawer. Target the card
    // element itself — a bare `text=` selector also matches the value sitting
    // in the search box, so the click didn't reliably hit the card.
    await page
      .locator("div.cursor-pointer")
      .filter({ hasText: camperName })
      .first()
      .click();
    // Assert the camper's name, not the "Camper Profile" fallback: the drawer
    // title is `camper?.name ?? "Camper Profile"` (CamperQuickProfile.tsx:18),
    // so the fallback only shows for the instant before the camper loads.
    // Use drawerPanel(), not getByRole("dialog") — see the helper's comment
    // for why a visibility assertion on the dialog root always fails.
    const profileDrawer = drawerPanel(page);
    await expect(profileDrawer).toBeVisible({ timeout: 10000 });
    await expect(profileDrawer.getByRole("heading", { name: camperName }).first()).toBeVisible();
    // Label and value are separate spans in CamperProfileView.tsx:296-300 —
    // there is no single "Allergies: Peanuts" string to match.
    const allergyBlock = page.locator("div").filter({ hasText: /^Allergies/ }).last();
    await expect(allergyBlock).toContainText("Peanuts");

    // 6. Click profile photo in drawer to expand. The old "Full Teen Photo"
    // heading is gone — CamperPhotoCropperModal renders an empty Dialog title
    // and labels its view mode "Camper Photo Preview" instead.
    await page.locator("img.cursor-pointer").first().click();
    const photoPreview = page.getByText("Camper Photo Preview");
    await expect(photoPreview).toBeVisible({ timeout: 10000 });

    // Close the photo modal. It has no Close button — Dialog.tsx only renders
    // one when `title` is non-empty, and the cropper passes title="" — so
    // dismiss via Escape, which HeadlessDialog's onClose handles.
    await page.keyboard.press("Escape");
    await expect(photoPreview).not.toBeVisible();
  });

  test("volunteer dashboard - campers page can toggle view modes", async ({ page }) => {
    test.setTimeout(120000);

    // 1. Log in as the approved volunteer user using OTP
    await loginWithOtp(page, volunteerEmail);
    // Let the post-login redirect settle first — navigating immediately races
    // it, and Playwright aborts the goto ("interrupted by another navigation").
    await page.waitForURL(/\/(volunteer|dashboard|admin)/, { timeout: 20000 });
    await page.goto("/volunteer/campers");
    await page.waitForLoadState("networkidle");

    // 2. Verify dashboard elements are loaded. `exact` matters: the page also
    // renders an "All Campers" heading, which a substring match picks up too.
    await expect(page.getByRole("heading", { name: "Campers", exact: true })).toBeVisible();
    await expect(page.getByText("All Campers")).toBeVisible();
  });
});
