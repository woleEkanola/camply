import { z } from "zod";
import { registerExport } from "../registry";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import { authorizeStaffAccess } from "./staff";
import { buildDuplicateReport } from "../../staff/duplicateDetection";
import type { ExportDescriptor } from "../types";

export interface StaffDuplicatesFilters {
  campId?: string;
  type?: "TEACHER" | "VOLUNTEER";
}

const staffDuplicatesFilterSchema: z.ZodType<StaffDuplicatesFilters> = z.object({
  campId: z.string().optional(),
  type: z.enum(["TEACHER", "VOLUNTEER"]).optional(),
});

/** One row per member (not per group), so it sorts and filters normally in a spreadsheet — the group key ties rows back together. */
function buildRows(report: Awaited<ReturnType<typeof buildDuplicateReport>>) {
  const rows: Record<string, any>[] = [];
  for (const group of report.groups) {
    for (const member of group.members) {
      rows.push({
        "Group": group.key,
        Confidence: group.confidence,
        Signals: group.signals.join(", "),
        "Integrity Alarm": group.integrityAlarm ? "Yes" : "",
        "Suggested Survivor": member.id === group.suggestedTargetId ? "Yes" : "",
        Name: `${member.firstName} ${member.lastName}`.trim(),
        Type: member.type,
        Status: member.status,
        Email: member.email,
        Phone: member.phone,
        Campus: member.campusName || "",
        Department: member.departmentName || "",
        Points: member.points,
        "Has ID Card": member.hasQrToken ? "Yes" : "No",
        "Registered At": member.createdAt.toISOString().slice(0, 10),
      });
    }
  }
  return rows;
}

export const staffDuplicatesDescriptor: ExportDescriptor<StaffDuplicatesFilters> = {
  kind: "STAFF_DUPLICATES",
  label: "Duplicate Registrations",
  formats: ["XLSX", "CSV"],
  presets: [
    { id: "ALL", label: "All Types", filters: {} },
    { id: "TEACHERS", label: "Teachers Only", filters: { type: "TEACHER" } },
    { id: "VOLUNTEERS", label: "Volunteers Only", filters: { type: "VOLUNTEER" } },
  ],
  filterSchema: staffDuplicatesFilterSchema,
  async authorize(ctx, params) {
    await authorizeStaffAccess(ctx, params.organizationId);
  },
  async count(ctx, params) {
    const filters = params.filters as StaffDuplicatesFilters;
    if (!filters.campId) return 0;
    const report = await buildDuplicateReport(ctx.prisma, { organizationId: params.organizationId, campId: filters.campId, type: filters.type });
    return report.groups.reduce((sum, g) => sum + g.members.length, 0);
  },
  async build(ctx, params, format, onProgress) {
    const filters = params.filters as StaffDuplicatesFilters;
    if (!filters.campId) throw new Error("A camp is required to detect duplicate registrations.");
    await onProgress({ stage: "Detecting duplicates…" });
    const report = await buildDuplicateReport(ctx.prisma, { organizationId: params.organizationId, campId: filters.campId, type: filters.type });
    const rows = buildRows(report);
    await onProgress({ processed: rows.length, total: rows.length, stage: "Building rows…" });

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
    return `camply-staff-duplicates-${stamp}.${format === "XLSX" ? "xlsx" : "csv"}`;
  },
};

registerExport(staffDuplicatesDescriptor);
