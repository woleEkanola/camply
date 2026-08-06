import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Export system: dialog → background job → Export Center → download", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let camperId: string | undefined;
  let parentId: string | undefined;
  const camperName = `e2e-export-camper-${Date.now()}`;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    const parent = await prisma.user.create({
      data: { email: `e2e-export-parent-${Date.now()}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: { name: camperName, userId: parent.id, organizationId, homeCampusId: ctx.campusId },
    });
    camperId = camper.id;
  });

  test.afterAll(async () => {
    if (camperId) {
      // Cascade-cleans any ExportJob rows created by these tests along with everything else.
      await prisma.exportJob.deleteMany({ where: { organizationId, label: { contains: "Campers" } } });
      await prisma.camper.deleteMany({ where: { id: camperId } });
    }
    if (parentId) await prisma.user.deleteMany({ where: { id: parentId } });
  });

  test("admin can run a Campers export end to end: dialog shows the current filter, job completes, and the download is non-empty", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.getByPlaceholder(/Search name, email, or registration/i).fill(camperName);
    await expect(page.getByText(camperName).first()).toBeVisible({ timeout: 15000 });

    // A single Export button opens a type picker first, replacing the
    // previous one-button-per-kind row (see ExportMenuButton.tsx).
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const picker = page.getByTestId("export-picker-panel");
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Campers", exact: true }).click();

    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Search: ${camperName}`)).toBeVisible();
    await expect(dialog.getByLabel(/Export current filtered results/i)).toBeChecked();

    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Open the header Export tray (mounted globally in AppShell) and wait for the job to finish.
    await page.getByRole("button", { name: "Open Downloads" }).click();
    const completedRow = page.getByText(/camply-campers-.*\.xlsx/).first();
    await expect(completedRow).toBeVisible({ timeout: 20000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download" }).first().click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error("Download did not produce a file path");

    const fs = await import("fs");
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(0);

    const job = await prisma.exportJob.findFirstOrThrow({
      where: { organizationId, kind: "CAMPERS", label: "Campers" },
      orderBy: { createdAt: "desc" },
    });
    expect(job.status).toBe("DONE");
    expect(job.fileSize).toBeGreaterThan(0);
  });

  test("medical summary export is hidden from a campus-representative-only session", async ({ page }) => {
    // A plain campus rep (not an org admin) doesn't get the Medical Summary
    // option in the export type picker at all — see CamperManagement.tsx's
    // canManageCampers gate. This is a UI convenience; server-side
    // authorization (assertOrgAdmin) is the real enforcement and is covered
    // by the CAMPERS_MEDICAL descriptor itself.
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/admin/campers");
    await expect(page.getByRole("heading", { name: "Campers", exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const picker = page.getByTestId("export-picker-panel");
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("button", { name: "Medical Summary" })).toHaveCount(0);
  });

  test("a failed export surfaces an error hint and can be retried from the Export Center", async ({ page }) => {
    test.setTimeout(30000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/import-export");

    // Seed a FAILED job directly (deterministic — no need to force a real generation failure).
    const failed = await prisma.exportJob.create({
      data: {
        organizationId,
        userId: (await prisma.user.findUniqueOrThrow({ where: { email: "owner@camply.com" } })).id,
        kind: "CAMPERS",
        format: "XLSX",
        label: "E2E Forced Failure",
        params: { organizationId, kind: "CAMPERS", format: "XLSX", scope: "ALL", filters: {} },
        status: "FAILED",
        attempts: 3,
        error: "Simulated failure for retry test",
        errorHint: "Try exporting by Campus or Tribe.",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    try {
      await page.reload();
      await page.getByRole("tab", { name: "Job History" }).click();
      const failedRow = page.getByText("E2E Forced Failure");
      await expect(failedRow).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("Try exporting by Campus or Tribe.")).toBeVisible();

      await page.getByRole("button", { name: "Retry" }).click();

      await expect
        .poll(async () => (await prisma.exportJob.findUniqueOrThrow({ where: { id: failed.id } })).status, { timeout: 15000 })
        .not.toBe("FAILED");
    } finally {
      await prisma.exportJob.deleteMany({ where: { id: failed.id } });
    }
  });
});
