import { z } from "zod";
import { registerExport } from "../registry";
import { authorizeStaffAccess, staffWhere } from "./staff";
import type { StaffFilters } from "./staff";
import type { ExportDescriptor } from "../types";
import { buildStaffIdCardData, STAFF_ID_CARD_INCLUDE } from "../../idcard/staffData";
import { renderStaffIdCardPng } from "../../idcard/renderStaffCard";
import { generateIdCardSheetPdf } from "../../idcard/sheetPdf";
import { ensureStaffQrToken } from "../../staff/idToken";

const staffIdCardFilterSchema: z.ZodType<StaffFilters> = z.object({
  campId: z.string().optional(),
  type: z.enum(["TEACHER", "VOLUNTEER"]).optional(),
  status: z.string().optional(),
  campusId: z.string().optional(),
  gender: z.string().optional(),
  tribeId: z.string().optional(),
  departmentId: z.string().optional(),
  volunteerCategory: z.string().optional(),
  search: z.string().optional(),
});

const CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const staffIdCardsDescriptor: ExportDescriptor<StaffFilters> = {
  kind: "STAFF_ID_CARDS",
  label: "Staff ID Cards",
  formats: ["PDF"],
  presets: [
    { id: "ALL", label: "All Staff", filters: {} },
    { id: "TEACHERS", label: "Teachers", filters: { type: "TEACHER" } },
    { id: "VOLUNTEERS", label: "Volunteers", filters: { type: "VOLUNTEER" } },
    { id: "APPROVED", label: "Approved Only", filters: { status: "APPROVED" } },
  ],
  filterSchema: staffIdCardFilterSchema,
  async authorize(ctx, params) {
    await authorizeStaffAccess(ctx, params.organizationId, (params.filters as StaffFilters)?.campusId);
  },
  async count(ctx, params) {
    const filters = params.filters as StaffFilters;
    return ctx.prisma.staffProfile.count({
      where: staffWhere(params.organizationId, filters, params.scope === "SELECTED" ? params.selectedIds : undefined),
    });
  },
  async build(ctx, params, _format, onProgress) {
    const filters = params.filters as StaffFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    await onProgress({ stage: "Fetching staff…" });
    const profiles: import("../../idcard/staffData").StaffProfileForIdCard[] = await ctx.prisma.staffProfile.findMany({
      where: staffWhere(params.organizationId, filters, ids),
      include: STAFF_ID_CARD_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    // Approved profiles missing a token predate this feature — issue one
    // lazily rather than silently skipping them from the export.
    await onProgress({ stage: "Issuing badge tokens…" });
    for (const p of profiles) {
      if (p.status === "APPROVED" && !p.qrToken) {
        p.qrToken = await ensureStaffQrToken(ctx.prisma, p.id);
      }
    }

    const total = profiles.length;
    let processed = 0;
    const rendered = await mapWithConcurrency(profiles, CONCURRENCY, async (profile) => {
      const cardData = buildStaffIdCardData(profile);
      const png = cardData ? await renderStaffIdCardPng(cardData) : null;
      processed++;
      if (processed % 5 === 0 || processed === total) {
        await onProgress({ processed, total, stage: "Rendering cards…" });
      }
      return png;
    });
    // Non-APPROVED staff can't render a card (buildStaffIdCardData returns
    // null) — skip them rather than fail the batch, same as camper ID_CARDS.
    const cardPngs = rendered.filter((png): png is Buffer => png !== null);

    await onProgress({ stage: "Paginating A4 sheets…" });
    const data = await generateIdCardSheetPdf(cardPngs);
    return { fileName: this.fileName(params, "PDF"), mimeType: "application/pdf", data };
  },
  fileName() {
    const stamp = new Date().toISOString().slice(0, 10);
    return `camply-staff-id-cards-${stamp}.pdf`;
  },
};

registerExport(staffIdCardsDescriptor);
