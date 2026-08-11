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

    // Verify Welcome Greeting & TEACHER badge
    await expect(page.locator("text=Welcome back, Lead!")).toBeVisible();
    await expect(page.getByText("TEACHER", { exact: true })).toBeVisible();

    // Verify Quick Actions Grid
    await expect(page.locator('button:has-text("QR Code Scanner")')).toBeVisible();
    await expect(page.locator('button:has-text("Take Attendance")')).toBeVisible();
    await expect(page.locator('button:has-text("My Tribe Roster")')).toBeVisible();
  });

  test("2. Campus Rep logs in and views redesigned Campus Management Hub", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/campus-rep-dashboard");

    await page.waitForSelector("text=Campus Management Hub", { timeout: 15000 });

    // Verify Campus Rep badge
    await expect(page.getByText("CAMPUS REPRESENTATIVE", { exact: true })).toBeVisible();

    // Verify Quick Action Cards
    await expect(page.locator('button:has-text("Review Registrations")')).toBeVisible();
    await expect(page.locator('button:has-text("Campus Campers")')).toBeVisible();
  });
});
