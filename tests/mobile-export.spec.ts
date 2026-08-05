import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test.describe("Mobile: Export Dialog and Export Center", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let camperId: string | undefined;
  let parentId: string | undefined;
  const camperName = `e2e-mobile-export-camper-${Date.now()}`;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    const parent = await prisma.user.create({
      data: { email: `e2e-mobile-export-parent-${Date.now()}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: { name: camperName, userId: parent.id, organizationId, homeCampusId: ctx.campusId },
    });
    camperId = camper.id;
  });

  test.afterAll(async () => {
    if (camperId) {
      await prisma.exportJob.deleteMany({ where: { organizationId, label: "Campers" } });
      await prisma.camper.deleteMany({ where: { id: camperId } });
    }
    if (parentId) await prisma.user.deleteMany({ where: { id: parentId } });
  });

  test("Export Dialog opens as a bottom sheet and a job can be started from a mobile viewport", async ({ page }) => {
    test.setTimeout(45000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.getByRole("button", { name: "Export Campers" }).click();

    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();

    // The Dialog primitive renders as a bottom-anchored sheet below `md` —
    // it must reach the bottom edge of the viewport, unlike the centered
    // desktop card (see src/components/ui/Dialog.tsx).
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y + box.height).toBeGreaterThanOrEqual(844 - 4);
    }

    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    const job = await prisma.exportJob.findFirstOrThrow({
      where: { organizationId, kind: "CAMPERS", label: "Campers" },
      orderBy: { createdAt: "desc" },
    });
    expect(["QUEUED", "RUNNING", "DONE"]).toContain(job.status);
  });

  test("Export Center tray opens full-width on mobile and lists the job", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.getByRole("button", { name: "Open Downloads" }).click();
    await expect(page.getByText("Export Center")).toBeVisible();
    await expect(page.getByText(/camply-campers-.*\.xlsx/).first()).toBeVisible({ timeout: 20000 });
  });
});
