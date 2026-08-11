import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { registerExport } from "../registry";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import type { ExportDescriptor } from "../types";

export interface CamperFilters {
  campId?: string;
  campusId?: string;
  gender?: string;
  tribeId?: string;
  status?: string;
  search?: string;
}

const camperFilterSchema: z.ZodType<CamperFilters> = z.object({
  campId: z.string().optional(),
  campusId: z.string().optional(),
  gender: z.string().optional(),
  tribeId: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

/**
 * Mirrors camper.adminList's access model: org admin, a campus rep scoped to
 * the campus being filtered on, or any TEACHER/VOLUNTEER in the same org
 * (they see the active camp's full roster in the app UI too).
 */
export async function authorizeCamperAccess(
  ctx: { prisma: any; session: any },
  organizationId: string,
  campusId?: string
) {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (user.role === "SUPER_ADMIN") return user;
  if (["OWNER", "ADMIN"].includes(user.role) && user.organizationId === organizationId) return user;
  if (["TEACHER", "VOLUNTEER"].includes(user.role) && user.organizationId === organizationId) return user;
  if (user.organizationId === organizationId && campusId) {
    const managed = await ctx.prisma.campus.findFirst({
      where: { id: campusId, reps: { some: { id: user.id } } },
    });
    if (managed) return user;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to export campers for this organization" });
}

function camperWhere(organizationId: string, filters: CamperFilters, ids?: string[]) {
  const where: Record<string, any> = { organizationId, deletedAt: null };
  if (ids?.length) where.id = { in: ids };
  if (filters.campusId) where.homeCampusId = filters.campusId;
  if (filters.gender) where.gender = filters.gender;
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { user: { email: { contains: s, mode: "insensitive" } } },
      { registrations: { some: { registrationNumber: { contains: s, mode: "insensitive" } } } },
    ];
  }
  if (filters.status || filters.campId || filters.tribeId) {
    where.registrations = {
      some: {
        ...(filters.status ? { status: filters.status as any } : {}),
        ...(filters.campId ? { campId: filters.campId } : {}),
        ...(filters.tribeId ? { tribeId: filters.tribeId } : {}),
      },
    };
  }
  return where;
}

async function buildCamperRow(camper: any) {
  const reg = camper.registrations?.[0];
  const ageVal = camper.dateOfBirth
    ? Math.floor((Date.now() - new Date(camper.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  return {
    "Camper Name": camper.name,
    "First Name": camper.firstName || "",
    "Last Name": camper.lastName || "",
    "Date of Birth": camper.dateOfBirth ? new Date(camper.dateOfBirth).toISOString().slice(0, 10) : "",
    Age: ageVal ?? "",
    Gender: camper.gender || "",
    "Parent Name": [camper.user?.firstName, camper.user?.lastName].filter(Boolean).join(" ") || camper.user?.email || "",
    "Parent Email": camper.user?.email || "",
    "Parent Phone": camper.parentPhone || "",
    "Registration Status": reg?.status || "NOT_REGISTERED",
    "Registration #": reg?.registrationNumber || "",
    Camp: reg?.camp?.name || "",
    Campus: reg?.campus?.name || camper.homeCampus?.name || "",
    Venue: reg?.venue?.name || "",
    Tribe: reg?.tribe?.name || "",
    Room: reg?.room?.name || "",
    Bed: reg?.bed?.label || "",
  };
}

async function fetchCampers(ctx: { prisma: any }, organizationId: string, filters: CamperFilters, ids?: string[]) {
  return ctx.prisma.camper.findMany({
    where: camperWhere(organizationId, filters, ids),
    include: {
      user: true,
      homeCampus: true,
      registrations: {
        where: {
          ...(filters.status ? { status: filters.status as any } : {}),
          ...(filters.campId ? { campId: filters.campId } : {}),
          ...(filters.tribeId ? { tribeId: filters.tribeId } : {}),
        },
        include: { camp: true, campus: true, venue: true, tribe: true, room: true, bed: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export const campersDescriptor: ExportDescriptor<CamperFilters> = {
  kind: "CAMPERS",
  label: "Campers",
  formats: ["XLSX", "CSV"],
  presets: [
    { id: "ALL", label: "All Campers", filters: {} },
    { id: "APPROVED", label: "Approved", filters: { status: "APPROVED" } },
    { id: "PENDING", label: "Pending", filters: { status: "PENDING" } },
    { id: "REQUIRES_ACTION", label: "Requires Action", filters: { status: "REQUIRES_ACTION" } },
    { id: "WAITLISTED", label: "Waitlisted", filters: { status: "WAITLISTED" } },
    { id: "REJECTED", label: "Rejected", filters: { status: "REJECTED" } },
    { id: "CHECKED_IN", label: "Checked In", filters: { status: "CHECKED_IN" } },
    { id: "COMPLETED", label: "Completed", filters: { status: "COMPLETED" } },
    { id: "ARCHIVED", label: "Archived", filters: { status: "ARCHIVED" } },
  ],
  filterSchema: camperFilterSchema,
  async authorize(ctx, params) {
    await authorizeCamperAccess(ctx, params.organizationId, (params.filters as CamperFilters)?.campusId);
  },
  async count(ctx, params) {
    const filters = params.filters as CamperFilters;
    return ctx.prisma.camper.count({
      where: camperWhere(params.organizationId, filters, params.scope === "SELECTED" ? params.selectedIds : undefined),
    });
  },
  async build(ctx, params, format, onProgress) {
    const filters = params.filters as CamperFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    await onProgress({ stage: "Fetching campers…" });
    const campers = await fetchCampers(ctx, params.organizationId, filters, ids);

    const total = campers.length;
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < campers.length; i++) {
      rows.push(await buildCamperRow(campers[i]));
      if (i % 50 === 0 || i === campers.length - 1) {
        await onProgress({ processed: i + 1, total, stage: "Building rows…" });
      }
    }

    await onProgress({ stage: format === "XLSX" ? "Generating workbook…" : "Generating CSV…" });
    if (format === "XLSX") {
      const blob = await exportUserDataToXlsx(rows);
      const data = Buffer.from(await blob.arrayBuffer());
      return { fileName: this.fileName(params, format), mimeType: blob.type, data };
    }
    const csv = exportUserDataToCsv(rows);
    return { fileName: this.fileName(params, format), mimeType: "text/csv", data: Buffer.from(csv, "utf-8") };
  },
  fileName(params, format) {
    const stamp = new Date().toISOString().slice(0, 10);
    return `camply-campers-${stamp}.${format === "XLSX" ? "xlsx" : "csv"}`;
  },
};

registerExport(campersDescriptor);
