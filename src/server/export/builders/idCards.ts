import { z } from "zod";
import { registerExport } from "../registry";
import { authorizeCamperAccess } from "./campers";
import type { CamperFilters } from "./campers";
import type { ExportDescriptor } from "../types";
import { buildCampIdCardData, ID_CARD_INCLUDE, type RegistrationForIdCard } from "../../idcard/data";
import { renderCampIdCardPng } from "../../idcard/renderCard";
import { buildIdCardChunk } from "./chunkedIdCardRender";

const idCardFilterSchema: z.ZodType<CamperFilters> = z.object({
  campId: z.string().optional(),
  campusId: z.string().optional(),
  gender: z.string().optional(),
  tribeId: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

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
  async buildChunk(ctx, params, _format, resumeIndex, deadline, onProgress) {
    const filters = params.filters as CamperFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    const where = registrationWhere(params.organizationId, filters, ids);

    if (resumeIndex === 0) await onProgress({ stage: "Fetching registrations…" });
    const total = await ctx.prisma.registration.count({ where });

    return buildIdCardChunk<RegistrationForIdCard>(
      {
        total,
        fileName: this.fileName(params, "PDF"),
        // [createdAt desc, id desc] rather than createdAt alone: createdAt is
        // not unique across rows created in the same millisecond, and a
        // non-unique cursor ordering can silently skip or repeat a row
        // between two separate buildChunk calls (which may run in different
        // process invocations, sometimes minutes apart).
        fetchRows: (skip, take) =>
          ctx.prisma.registration.findMany({
            where,
            include: ID_CARD_INCLUDE,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take,
          }),
        renderRow: (registration, logoCache) => {
          const cardData = buildCampIdCardData(registration);
          if (!cardData) return Promise.resolve(null);
          return renderCampIdCardPng(cardData, { logoCache, encodeAs: "jpeg" });
        },
      },
      ctx.stagePart,
      resumeIndex,
      deadline,
      onProgress
    );
  },
  fileName() {
    const stamp = new Date().toISOString().slice(0, 10);
    return `camply-id-cards-${stamp}.pdf`;
  },
};

registerExport(idCardsDescriptor);
