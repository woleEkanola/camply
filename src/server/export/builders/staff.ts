import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { registerExport } from "../registry";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import type { ExportDescriptor } from "../types";

export interface StaffFilters {
  campId?: string;
  type?: "TEACHER" | "VOLUNTEER";
  status?: string;
  campusId?: string;
  gender?: string;
  tribeId?: string;
  departmentId?: string;
  volunteerCategory?: string;
  search?: string;
}

const staffFilterSchema: z.ZodType<StaffFilters> = z.object({
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

/** Mirrors staff.adminList's access model — org admin or a campus rep
 * scoped to the campus being filtered on. */
export async function authorizeStaffAccess(
  ctx: { prisma: any; session: any },
  organizationId: string,
  campusId?: string
) {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (user.role === "SUPER_ADMIN") return user;
  if (["OWNER", "ADMIN"].includes(user.role) && user.organizationId === organizationId) return user;
  if (user.organizationId === organizationId && campusId) {
    const managed = await ctx.prisma.campus.findFirst({
      where: { id: campusId, reps: { some: { id: user.id } } },
    });
    if (managed) return user;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to export staff for this organization" });
}

export function staffWhere(organizationId: string, filters: StaffFilters, ids?: string[]) {
  const where: Record<string, any> = { organizationId, deletedAt: null };
  if (ids?.length) where.id = { in: ids };
  if (filters.campId) where.campId = filters.campId;
  if (filters.type) where.type = filters.type;
  if (filters.status) where.status = filters.status;
  if (filters.campusId) where.preferredCampusId = filters.campusId;
  if (filters.gender) where.gender = filters.gender;
  if (filters.tribeId) where.assignedTribeId = filters.tribeId;
  if (filters.departmentId) where.departmentId = filters.departmentId;
  if (filters.volunteerCategory) where.volunteerCategory = filters.volunteerCategory;
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    where.OR = [
      { firstName: { contains: s, mode: "insensitive" } },
      { lastName: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
    ];
  }
  return where;
}

function buildStaffRow(profile: any) {
  return {
    Name: `${profile.firstName} ${profile.lastName}`.trim(),
    Role: profile.type,
    Status: profile.status,
    Campus: profile.preferredCampus?.name || "",
    Department: profile.department?.name || profile.volunteerCategory || "",
    "Department Head": profile.isDepartmentHead ? "Yes" : "",
    Tribe: profile.assignedTribe?.name || "",
    "Camp Monitor": profile.isCampMonitor ? "Yes" : profile.isAssistantMonitor ? "Assistant" : "",
    Gender: profile.gender || "",
    Phone: profile.phone,
    Email: profile.email,
    Venue: profile.assignedVenue?.name || "",
    Hostel: profile.assignedHostel?.name || "",
    Room: profile.assignedRoom?.name || "",
    Bed: profile.assignedBed?.label || "",
    Skills: (profile.skills || []).join(", "),
    "Has ID Card": profile.qrToken ? "Yes" : "No",
    "ID Card URL": profile.qrToken ? `/api/staff-id-card/${profile.qrToken}` : "",
  };
}

async function fetchStaff(ctx: { prisma: any }, organizationId: string, filters: StaffFilters, ids?: string[]) {
  return ctx.prisma.staffProfile.findMany({
    where: staffWhere(organizationId, filters, ids),
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
}

export const staffDescriptor: ExportDescriptor<StaffFilters> = {
  kind: "STAFF",
  label: "Staff",
  formats: ["XLSX", "CSV"],
  presets: [
    { id: "ALL", label: "All Staff", filters: {} },
    { id: "TEACHERS", label: "Teachers", filters: { type: "TEACHER" } },
    { id: "VOLUNTEERS", label: "Volunteers", filters: { type: "VOLUNTEER" } },
    { id: "APPROVED", label: "Approved Only", filters: { status: "APPROVED" } },
  ],
  filterSchema: staffFilterSchema,
  async authorize(ctx, params) {
    await authorizeStaffAccess(ctx, params.organizationId, (params.filters as StaffFilters)?.campusId);
  },
  async count(ctx, params) {
    const filters = params.filters as StaffFilters;
    return ctx.prisma.staffProfile.count({
      where: staffWhere(params.organizationId, filters, params.scope === "SELECTED" ? params.selectedIds : undefined),
    });
  },
  async build(ctx, params, format, onProgress) {
    const filters = params.filters as StaffFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    await onProgress({ stage: "Fetching staff…" });
    const staff = await fetchStaff(ctx, params.organizationId, filters, ids);

    const total = staff.length;
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < staff.length; i++) {
      rows.push(buildStaffRow(staff[i]));
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
    return `camply-staff-${stamp}.${format === "XLSX" ? "xlsx" : "csv"}`;
  },
};

registerExport(staffDescriptor);
