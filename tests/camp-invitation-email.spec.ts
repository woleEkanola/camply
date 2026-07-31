import { test, expect } from "@playwright/test";
import { loginWithPassword, prisma } from "./helpers";
import { DEFAULT_TEMPLATES } from "../src/server/email/defaults";

test.describe("Communication: Camp Invitation certificate email", () => {
  test("branding Next Steps/contact edits, Camp Invitation preview, and campaign personalization toggle", async ({ page }) => {
    // ─── PART A: Branding — new certificate fields + Next Steps editor ───
    await loginWithPassword(page, "admin@camply.com", "password123");

    // The templates page only auto-seeds all ALL_EVENT_KEYS templates the
    // first time an org has zero EmailEventConfig rows — this shared fixture
    // org has already been seeded by prior sessions before CAMP_INVITATION
    // existed, so ensure its row exists directly rather than relying on that
    // one-time auto-seed to fire again.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const existingConfig = await prisma.emailEventConfig.findUnique({
      where: { organizationId_event: { organizationId: admin.organizationId!, event: "CAMP_INVITATION" } },
    });
    if (!existingConfig) {
      const def = DEFAULT_TEMPLATES.CAMP_INVITATION;
      const template = await prisma.emailTemplate.create({
        data: {
          organizationId: admin.organizationId!,
          name: def.name,
          description: def.description,
          subject: def.subject,
          previewText: def.previewText,
          content: def.content as any,
          isDefault: true,
        },
      });
      await prisma.emailEventConfig.create({
        data: { organizationId: admin.organizationId!, event: "CAMP_INVITATION", templateId: template.id },
      });
    }

    await page.goto("/admin/communication/branding");
    await expect(page.locator("h1")).toContainText("Email Branding");

    const taglineInput = page.locator('label:has-text("Tagline")').locator("xpath=following-sibling::input[1]");
    await expect(taglineInput).toBeVisible({ timeout: 10000 });
    await taglineInput.fill("Raising a generation of world changers");

    const supportTitleInput = page
      .locator('label:has-text("Contact Card Title")')
      .locator("xpath=following-sibling::input[1]");
    await supportTitleInput.fill("Need Assistance?");

    // ContactCard only renders when at least one contact method is set
    const supportEmailInput = page.locator('label:has-text("Support Email")').locator("xpath=following-sibling::input[1]");
    await supportEmailInput.fill("help@example.com");

    // Edit the first Next Steps item's title
    const firstStepTitle = page.getByLabel("Title").first();
    await firstStepTitle.fill("Print Your Invitation");

    await page.getByRole("button", { name: "Save Branding" }).click();
    await expect(page.getByText("Saved successfully")).toBeVisible({ timeout: 10000 });

    // Reload and confirm persistence
    await page.reload();
    await expect(taglineInput).toHaveValue("Raising a generation of world changers", { timeout: 10000 });
    await expect(supportTitleInput).toHaveValue("Need Assistance?");
    await expect(page.getByLabel("Title").first()).toHaveValue("Print Your Invitation");

    // ─── PART B: Templates — Camp Invitation certificate preview ───
    await page.goto("/admin/communication/templates");
    await expect(page.locator("h1")).toContainText("Email Templates");

    const campInvitationBtn = page.locator('button:has-text("Camp Invitation")');
    await expect(campInvitationBtn).toBeVisible({ timeout: 15000 });
    await campInvitationBtn.click();

    const subjectInput = page.locator('input[placeholder="Enter subject line..."]');
    await expect(subjectInput).toBeVisible({ timeout: 10000 });

    // Preview width auto-switches to the certificate (A4) layout
    const iframe = page.frameLocator('iframe[title="Live email render preview"]');
    await expect(iframe.locator('img[alt="QR Code"]')).toBeVisible({ timeout: 15000 });

    // Branding edits from Part A flow through into the certificate render
    await expect(iframe.getByText("Raising a generation of world changers").first()).toBeVisible();
    await expect(iframe.getByText("Need Assistance?")).toBeVisible();
    await expect(iframe.getByText("PRINT YOUR INVITATION")).toBeVisible();

    // Sample data includes an assigned room — Hostel & Room row should render
    await expect(iframe.getByText(/Hostel & Room/i)).toBeVisible();
    await expect(iframe.getByText(/Grace Hostel/)).toBeVisible();

    // Never a Camply logo on this certificate-style email
    const html = (await page.locator('iframe[title="Live email render preview"]').getAttribute("srcdoc")) ?? "";
    expect(html.toLowerCase()).not.toContain("camply logo");

    // ─── PART C: Campaign composer — personalization toggle ───
    await page.goto("/admin/communication/campaigns/new");
    await expect(page.locator("h1")).toContainText("New Campaign");

    const personalizeCheckbox = page.getByRole("checkbox", { name: /Personalize as Camp Invitation/i });
    await expect(personalizeCheckbox).toBeVisible({ timeout: 10000 });

    // Before toggling, the ordinary audience picker is shown
    await expect(page.getByText("Recipient Type")).toBeVisible();

    await personalizeCheckbox.check();

    // After toggling, the camp picker replaces the generic audience picker
    await expect(page.getByText("Recipient Type")).not.toBeVisible();
    await expect(page.getByText("Only APPROVED registrations for this camp will receive the invitation.")).toBeVisible();
  });
});
