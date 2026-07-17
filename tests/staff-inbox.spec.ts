import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithOtp, deleteStaffByEmail } from "./helpers";

/**
 * Phase 3: staff inbox backed by BroadcastRecipient. Teachers see broadcasts
 * addressed to them, can mark read/unread, and pin/unpin items.
 */
test.describe("Staff inbox", () => {
  test.describe.configure({ mode: "serial" });

  const teacherEmail = `e2e-staff-inbox-teacher-${Date.now()}@camply.test`;

  let organizationId: string;
  let campId: string;
  let teacherUserId: string;
  let broadcastId: string;
  let recipientId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const teacherUser = await prisma.user.create({
      data: { email: teacherEmail, password: "unused-otp-login", role: "TEACHER", organizationId },
    });
    teacherUserId = teacherUser.id;
    await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "Inbox",
        lastName: "Teacher",
        phone: "+1-555-0920",
        email: teacherEmail,
        approvedAt: new Date(),
      },
    });

    const broadcast = await prisma.broadcast.create({
      data: {
        organizationId,
        campId,
        title: "E2E Broadcast Title",
        subject: "E2E Broadcast Subject",
        body: { type: "doc", content: [{ type: "paragraph", content: [{ text: "Hello staff!" }] }] },
        audience: "TEACHERS",
        status: "COMPLETED",
        createdById: teacherUserId,
        sentAt: new Date(),
        completedAt: new Date(),
      },
    });
    broadcastId = broadcast.id;

    const recipient = await prisma.broadcastRecipient.create({
      data: {
        broadcastId: broadcast.id,
        recipientId: teacherUserId,
        email: teacherEmail,
        status: "SENT",
        sentAt: new Date(),
      },
    });
    recipientId = recipient.id;
  });

  test.afterAll(async () => {
    await prisma.broadcastRecipient.deleteMany({ where: { id: recipientId } });
    await prisma.broadcast.deleteMany({ where: { id: broadcastId } });
    await deleteStaffByEmail(teacherEmail);
  });

  test("teacher sees broadcast, marks read, and pins it", async ({ page }) => {
    await loginWithOtp(page, teacherEmail);
    await page.waitForURL(/\/teacher/, { timeout: 15000 });

    await page.goto("/teacher/inbox");
    await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();

    // Message appears with New badge.
    await expect(page.getByText("E2E Broadcast Title")).toBeVisible();
    await expect(page.getByText("New")).toBeVisible();

    // Mark read.
    await page.getByRole("button", { name: "Mark read" }).first().click();
    await expect(page.getByText("New")).not.toBeVisible();

    // Pin it.
    await page.getByTestId("pin-button").first().click();
    await expect(page.getByTestId("pinned-badge")).toBeVisible();

    // Switch to Pinned tab.
    await page.getByTestId("inbox-tab-pinned").click();
    await expect(page.getByText("E2E Broadcast Title")).toBeVisible();

    // Open message detail.
    await page.getByText("E2E Broadcast Title").click();
    await expect(page.getByText("Hello staff!")).toBeVisible();
    await page.getByTestId("inbox-close-button").click();

    // Switch back to All tab and unpin.
    await page.getByTestId("inbox-tab-all").click();
    await page.getByTestId("unpin-button").first().click();
    await expect(page.getByTestId("pin-button")).toBeVisible();
  });
});
