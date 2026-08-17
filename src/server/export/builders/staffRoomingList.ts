import { z } from "zod";
import { registerExport } from "../registry";
import { authorizeStaffAccess, staffWhere, type StaffFilters } from "./staff";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import type { ExportDescriptor } from "../types";

export interface StaffRoomingFilters extends StaffFilters {
  hostelId?: string;
  floorId?: string;
  roomId?: string;
  bedStatus?: "ASSIGNED" | "UNASSIGNED";
}

const staffRoomingFilterSchema: z.ZodType<StaffRoomingFilters> = z.object({
  campId: z.string().optional(),
  type: z.enum(["TEACHER", "VOLUNTEER"]).optional(),
  status: z.string().optional(),
  campusId: z.string().optional(),
  gender: z.string().optional(),
  tribeId: z.string().optional(),
  departmentId: z.string().optional(),
  volunteerCategory: z.string().optional(),
  search: z.string().optional(),
  hostelId: z.string().optional(),
  floorId: z.string().optional(),
  roomId: z.string().optional(),
  bedStatus: z.enum(["ASSIGNED", "UNASSIGNED"]).optional(),
});

function staffRoomingWhere(organizationId: string, filters: StaffRoomingFilters, ids?: string[]) {
  const where = staffWhere(organizationId, filters, ids);
  if (filters.hostelId) where.assignedHostelId = filters.hostelId;
  if (filters.floorId) where.assignedRoom = { floorId: filters.floorId };
  if (filters.roomId) where.assignedRoomId = filters.roomId;
  if (filters.bedStatus === "ASSIGNED") where.assignedBed = { isNot: null };
  if (filters.bedStatus === "UNASSIGNED") where.assignedBed = { is: null };
  return where;
}

function buildRow(profile: any) {
  return {
    Name: `${profile.firstName} ${profile.lastName}`.trim(),
    Role: profile.type,
    Status: profile.status,
    Gender: profile.gender || "",
    Tribe: profile.assignedTribe?.name || "",
    Campus: profile.preferredCampus?.name || "",
    "Assigned Venue": profile.assignedVenue?.name || "",
    Department: profile.department?.name || profile.volunteerCategory || "",
    Hostel: profile.assignedHostel?.name || "",
    Room: profile.assignedRoom?.name || "",
    Bed: profile.assignedBed?.label || "",
    Phone: profile.phone || "",
    Email: profile.email || "",
  };
}

export const staffRoomingListDescriptor: ExportDescriptor<StaffRoomingFilters> = {
  kind: "STAFF_ROOMING_LIST",
  label: "Staff Rooming List",
  formats: ["XLSX", "CSV"],
  presets: [
    { id: "ALL", label: "All Staff", filters: {} },
    { id: "TEACHERS", label: "Teachers", filters: { type: "TEACHER" } },
    { id: "VOLUNTEERS", label: "Volunteers", filters: { type: "VOLUNTEER" } },
    { id: "UNASSIGNED", label: "No Bed Assigned", filters: { bedStatus: "UNASSIGNED" } },
  ],
  filterSchema: staffRoomingFilterSchema,
  async authorize(ctx, params) {
    await authorizeStaffAccess(ctx, params.organizationId, (params.filters as StaffRoomingFilters)?.campusId);
  },
  async count(ctx, params) {
    const filters = params.filters as StaffRoomingFilters;
    return ctx.prisma.staffProfile.count({
      where: staffRoomingWhere(params.organizationId, filters, params.scope === "SELECTED" ? params.selectedIds : undefined),
    });
  },
  async build(ctx, params, format, onProgress) {
    const filters = params.filters as StaffRoomingFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    await onProgress({ stage: "Fetching staff…" });
    const staff = await ctx.prisma.staffProfile.findMany({
      where: staffRoomingWhere(params.organizationId, filters, ids),
      include: {
        preferredCampus: true,
        department: true,
        assignedTribe: true,
        assignedVenue: true,
        assignedHostel: true,
        assignedRoom: true,
        assignedBed: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const total = staff.length;
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < staff.length; i++) {
      rows.push(buildRow(staff[i]));
      if (i % 50 === 0 || i === staff.length - 1) {
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
    return `camply-staff-rooming-list-${stamp}.${format === "XLSX" ? "xlsx" : "csv"}`;
  },
};

registerExport(staffRoomingListDescriptor);
