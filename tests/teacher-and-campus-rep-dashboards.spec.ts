import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, getFixtureOrgContext } from "./helpers";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

test.describe("Teacher & Campus Rep Dashboards Redesign E2E Test", () => {
  let teacherUserId: string;
  let teacherEmail: string;

  test.beforeAll(async () => {
    const suffix = `${Date.now()}`;
    const ctx = await getFixtureOrgContext();

    teacherEmail = `dash-teacher-${suffix}@camply.test`;
    const teacherUser = await prisma.user.create({
      data: {
        email: teacherEmail,
        password: await hashPassword("password123"),
        role: "TEACHER",
        organizationId: ctx.organizationId,
      },
    });
    teacherUserId = teacherUser.id;

    await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId: ctx.organizationId,
        campId: ctx.campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "Lead",
        lastName: "Teacher",
        email: teacherEmail,
        phone: "08011223344",
      },
    });
  });

  test.afterAll(async () => {
    if (teacherUserId) {
      await prisma.staffProfile.deleteMany({ where: { userId: teacherUserId } }).catch(() => {});
      await prisma.user.delete({ where: { id: teacherUserId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("1. Teacher logs in and views redesigned Teacher Hub", async ({ page }) => {
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher");

    await page.waitForSelector("text=Teacher Dashboard", { timeout: 15000 });

    const teacherWelcome = page.getByRole("heading", { name: /Welcome back, Lead/ });
    await expect(teacherWelcome).toHaveCount(1);
    const [photoBox, welcomeBox, positionBox] = await Promise.all([
      page.getByRole("link", { name: "Upload photo" }).boundingBox(),
      teacherWelcome.boundingBox(),
      page.getByRole("heading", { name: "My position" }).boundingBox(),
    ]);
    expect(photoBox!.y).toBeLessThan(welcomeBox!.y);
    expect(welcomeBox!.y).toBeLessThan(positionBox!.y);

    await expect(page.getByRole("heading", { name: "My position" })).toBeVisible();
    await expect(page.getByText("You Are Here", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /My Tribe Hub/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Inbox/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Report an incident/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Campers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Inbox", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Incidents" })).toBeVisible();
    await page.goto("/teacher/my-position");
    await expect(page).toHaveURL(/\/teacher$/);
  });

  test("2. Campus Rep logs in and views redesigned Campus Management Hub", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/campus-rep-dashboard");

    await page.waitForSelector("text=Campus Management Hub", { timeout: 15000 });

    // Verify Campus Rep badge
    await expect(page.getByText("CAMPUS REPRESENTATIVE", { exact: true })).toBeVisible();
    await expect(page.getByText("My assignment", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My position" })).toBeVisible();
    await expect(page.getByRole("link", { name: /My Tribe Hub/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrations" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Campers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Inbox", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Incidents" })).toBeVisible();

    // Verify Quick Action Cards
    await expect(page.locator('button:has-text("Review Registrations")')).toBeVisible();
    await expect(page.locator('button:has-text("Campus Campers")')).toBeVisible();
  });
});
