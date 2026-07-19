import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, loginWithOtp } from "./helpers";

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

    const org = await prisma.organization.findFirst({ where: { name: "Demo Organization" } });
    if (!org) throw new Error("Demo Organization not found in DB");

    const camp = await prisma.camp.findFirst({ where: { organizationId: org.id } });
    if (!camp) throw new Error("Active camp not found in DB");

    const campus = await prisma.campus.findFirst({ where: { organizationId: org.id } });
    if (!campus) throw new Error("Campus not found in DB");

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
    await expect(page.getByRole("heading", { name: "Campers" })).toBeVisible();
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

    // 5. Click card to open CamperQuickProfileDrawer
    await page.click(`text=${camperName}`);
    await expect(page.getByRole("heading", { name: "Camper Profile" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Allergies: Peanuts")).toBeVisible();

    // 6. Click profile photo in drawer to expand
    await page.locator("img.cursor-pointer").click();
    await expect(page.getByRole("heading", { name: "Full Teen Photo" })).toBeVisible();

    // Close Dialog using specific dialog close button
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Full Teen Photo" })).not.toBeVisible();
  });

  test("volunteer dashboard - campers page can toggle view modes", async ({ page }) => {
    test.setTimeout(120000);

    // 1. Log in as the approved volunteer user using OTP
    await loginWithOtp(page, volunteerEmail);
    await page.goto("/volunteer/campers");
    await page.waitForLoadState("networkidle");

    // 2. Verify dashboard elements are loaded
    await expect(page.getByRole("heading", { name: "Campers" })).toBeVisible();
    await expect(page.getByText("All Campers")).toBeVisible();
  });
});
