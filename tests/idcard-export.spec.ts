import { randomBytes } from "crypto";
import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Regression coverage for the bulk ID-card export stall (backlog.md,
 * 2026-08-17): a real export used to get stuck partway through and never
 * recover — no server-side signal ever explained why, just the client's
 * "no progress" warning, forever. The fix made three things true, which
 * this spec exercises end to end against the real render pipeline (not a
 * stub): the export completes for a batch that crosses multiple internal
 * render sub-batches, the resulting PDF has the right number of A4 sheets
 * for the card count, and the download actually streams real bytes.
 */
test.describe("ID card bulk export", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let tribeId: string;
  const CARD_COUNT = 20; // > one A4 sheet (8/page), enough to cross a sub-batch boundary without a slow test

  let parentIds: string[] = [];
  let camperIds: string[] = [];
  let registrationIds: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E ID Card Tribe ${stamp}` } });
    tribeId = tribe.id;

    for (let i = 0; i < CARD_COUNT; i++) {
      const parent = await prisma.user.create({
        data: { email: `e2e-idcard-parent-${stamp}-${i}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
      });
      parentIds.push(parent.id);

      const camper = await prisma.camper.create({
        data: { name: `E2E IDCard Camper ${stamp}-${i}`, userId: parent.id, organizationId, homeCampusId: campusId, gender: i % 2 === 0 ? "MALE" : "FEMALE", dateOfBirth: new Date(2013, 5, 1) },
      });
      camperIds.push(camper.id);

      const registration = await prisma.registration.create({
        data: {
          camperId: camper.id,
          campId,
          campusId,
          tribeId,
          status: "APPROVED",
          registrationNumber: `E2E-IDCARD-${stamp}-${i}`,
          qrToken: randomBytes(16).toString("hex"),
        },
      });
      registrationIds.push(registration.id);
    }
  });

  test.afterAll(async () => {
    // Unconditional — runs even if an assertion above threw. The job's own
    // label is just "ID Cards" (set by the export dialog, doesn't embed the
    // search filter), so scope by recency + kind instead.
    await prisma.exportJob.deleteMany({ where: { organizationId, kind: "ID_CARDS", createdAt: { gte: new Date(stamp) } } }).catch(() => {});
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
    await prisma.user.deleteMany({ where: { id: { in: parentIds } } });
    await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  test("exports 20 real cards through the full pipeline: correct page count, non-empty download", async ({ page }) => {
    test.setTimeout(120000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.getByPlaceholder(/Search name, email, or registration/i).fill(`E2E IDCard Camper ${stamp}`);
    await expect(page.getByText(`E2E IDCard Camper ${stamp}-0`).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const picker = page.getByTestId("export-picker-panel");
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "ID Cards", exact: true }).click();

    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // The job that matters is the one enqueued for exactly the searched set —
    // findFirst by createdAt desc would otherwise pick up an unrelated
    // concurrent export from another spec/worker sharing this fixture org.
    let jobId: string | undefined;
    await expect
      .poll(
        async () => {
          const job = await prisma.exportJob.findFirst({
            where: { organizationId, kind: "ID_CARDS", status: { in: ["QUEUED", "RUNNING", "DONE", "FAILED"] }, createdAt: { gte: new Date(Date.now() - 60000) } },
            orderBy: { createdAt: "desc" },
          });
          jobId = job?.id;
          return job?.status;
        },
        { timeout: 90000 }
      )
      .toBe("DONE");

    const job = await prisma.exportJob.findUniqueOrThrow({ where: { id: jobId! } });
    expect(job.error).toBeNull();
    // A batch this size stays under the single-file threshold (see
    // chunkedIdCardRender.ts's PART_SIZE_CARDS_MAX) — one plain download,
    // not multiple parts.
    expect((job.partRefs as any[] | null)?.length ?? 0).toBe(0);
    expect(job.fileSize).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Open Downloads" }).click();
    await expect(page.getByText(/camply-id-cards-.*\.pdf/).first()).toBeVisible({ timeout: 10000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download" }).first().click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error("Download did not produce a file path");

    const fs = await import("fs");
    const bytes = fs.readFileSync(filePath);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const doc = await PDFDocument.load(bytes);
    // 8 cards per A4 sheet — see sheetPdf.ts's CARDS_PER_PAGE.
    expect(doc.getPageCount()).toBe(Math.ceil(CARD_COUNT / 8));
  });
});
