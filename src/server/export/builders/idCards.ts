import { z } from "zod";
import { registerExport } from "../registry";
import { authorizeCamperAccess } from "./campers";
import type { CamperFilters } from "./campers";
import type { ExportDescriptor } from "../types";
import { buildCampIdCardData, ID_CARD_INCLUDE } from "../../idcard/data";
import { renderCampIdCardPng } from "../../idcard/renderCard";
import { generateIdCardSheetPdf } from "../../idcard/sheetPdf";

const idCardFilterSchema: z.ZodType<CamperFilters> = z.object({
  campId: z.string().optional(),
  campusId: z.string().optional(),
  gender: z.string().optional(),
  tribeId: z.string().optional(),
  status: z.string().optional(),
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

function registrationWhere(organizationId: string, filters: CamperFilters, ids?: string[]) {
  const where: Record<string, any> = {
    camper: { organizationId, deletedAt: null },
    deletedAt: null,
  };
  if (ids?.length) where.id = { in: ids };
  if (filters.campusId) where.campusId = filters.campusId;
  if (filters.campId) where.campId = filters.campId;
  if (filters.tribeId) where.tribeId = filters.tribeId;
  if (filters.status) where.status = filters.status as any;
  if (filters.gender) where.camper = { ...where.camper, gender: filters.gender };
  return where;
}

export const idCardsDescriptor: ExportDescriptor<CamperFilters> = {
  kind: "ID_CARDS",
  label: "ID Cards",
  formats: ["PDF"],
  presets: [
    { id: "ALL", label: "All Campers", filters: {} },
    { id: "APPROVED", label: "Approved Campers", filters: { status: "APPROVED" } },
    { id: "CHECKED_IN", label: "Checked In", filters: { status: "CHECKED_IN" } },
  ],
  filterSchema: idCardFilterSchema,
  async authorize(ctx, params) {
    await authorizeCamperAccess(ctx, params.organizationId, (params.filters as CamperFilters)?.campusId);
  },
  async count(ctx, params) {
    const filters = params.filters as CamperFilters;
    return ctx.prisma.registration.count({
      where: registrationWhere(params.organizationId, filters, params.scope === "SELECTED" ? params.selectedIds : undefined),
    });
  },
  async build(ctx, params, _format, onProgress) {
    const filters = params.filters as CamperFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    await onProgress({ stage: "Fetching registrations…" });
    const registrations: import("../../idcard/data").RegistrationForIdCard[] = await ctx.prisma.registration.findMany({
      where: registrationWhere(params.organizationId, filters, ids),
      include: ID_CARD_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    const total = registrations.length;
    let processed = 0;
    const rendered = await mapWithConcurrency(registrations, CONCURRENCY, async (reg) => {
      const cardData = buildCampIdCardData(reg);
      const png = cardData ? await renderCampIdCardPng(cardData) : null;
      processed++;
      if (processed % 5 === 0 || processed === total) {
        await onProgress({ processed, total, stage: "Rendering cards…" });
      }
      return png;
    });
    // Registrations without an approved qrToken/tribe can't render a card
    // (buildCampIdCardData returns null) — skip them rather than fail the batch.
    const cardPngs = rendered.filter((png): png is Buffer => png !== null);

    await onProgress({ stage: "Paginating A4 sheets…" });
    const data = await generateIdCardSheetPdf(cardPngs);
    return { fileName: this.fileName(params, "PDF"), mimeType: "application/pdf", data };
  },
  fileName() {
    const stamp = new Date().toISOString().slice(0, 10);
    return `camply-id-cards-${stamp}.pdf`;
  },
};

registerExport(idCardsDescriptor);
