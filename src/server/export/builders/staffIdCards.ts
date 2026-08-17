import { z } from "zod";
import { registerExport } from "../registry";
import { authorizeStaffAccess, staffWhere } from "./staff";
import type { StaffFilters } from "./staff";
import type { ExportDescriptor } from "../types";
import { buildStaffIdCardData, STAFF_ID_CARD_INCLUDE, type StaffProfileForIdCard } from "../../idcard/staffData";
import { renderStaffIdCardPng } from "../../idcard/renderStaffCard";
import { ensureStaffQrToken } from "../../staff/idToken";
import { buildIdCardChunk } from "./chunkedIdCardRender";

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
  async buildChunk(ctx, params, _format, resumeIndex, deadline, onProgress) {
    const filters = params.filters as StaffFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    const where = staffWhere(params.organizationId, filters, ids);

    if (resumeIndex === 0) await onProgress({ stage: "Fetching staff…" });
    const total = await ctx.prisma.staffProfile.count({ where });

    return buildIdCardChunk<StaffProfileForIdCard>(
      {
        total,
        fileName: this.fileName(params, "PDF"),
        fetchRows: (skip, take) =>
          ctx.prisma.staffProfile.findMany({
            where,
            include: STAFF_ID_CARD_INCLUDE,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take,
          }),
        renderRow: async (profile, logoCache) => {
          // Approved profiles missing a token predate this feature — issue one
          // lazily rather than silently skipping them from the export. Done
          // per-row (not as an upfront pass over every profile, as the
          // pre-chunked version did) so a resumed job never re-issues a token
          // for a profile it already handled in an earlier chunk.
          if (profile.status === "APPROVED" && !profile.qrToken) {
            profile.qrToken = await ensureStaffQrToken(ctx.prisma, profile.id);
          }
          const cardData = buildStaffIdCardData(profile);
          if (!cardData) return null;
          return renderStaffIdCardPng(cardData, { logoCache, encodeAs: "jpeg" });
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
    return `camply-staff-id-cards-${stamp}.pdf`;
  },
};

registerExport(staffIdCardsDescriptor);
