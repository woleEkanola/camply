import { z } from "zod";
import Papa from "papaparse";
import type { ExportArtifact, ExportDescriptor, ExportEnqueueParams, ExportFormat } from "../types";
import { registerExport } from "../registry";
import { assertOrgAdminOrCommand } from "../../api/trpc/scoping";
import { format } from "date-fns";
import type { CampScheduleEvent } from "@prisma/client";

const filterSchema = z.object({
  campId: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export const scheduleExportDescriptor: ExportDescriptor<z.infer<typeof filterSchema>> = {
  kind: "PROGRAM_SCHEDULE",
  label: "Program Schedule",
  formats: ["XLSX", "CSV", "JSON", "MD"],
  presets: [],
  filterSchema,

  async authorize(ctx, params) {
    await assertOrgAdminOrCommand(ctx, params.organizationId, "SCHEDULE");
  },

  async count(ctx, params) {
    const { campId, status = "PUBLISHED" } = params.filters as z.infer<typeof filterSchema>;
    const schedule = await ctx.prisma.campSchedule.findFirst({
      where: { campId, status },
      include: { events: true },
    });
    return schedule?.events.length ?? 0;
  },

  fileName(params, formatType) {
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const ext = formatType === "MD" ? "md" : formatType.toLowerCase();
    return `program-schedule-${dateStr}.${ext}`;
  },

  async build(ctx, params, formatType) {
    const { campId, status = "PUBLISHED" } = params.filters as z.infer<typeof filterSchema>;
    const schedule = await ctx.prisma.campSchedule.findFirst({
      where: { campId, status },
      include: {
        events: {
          orderBy: [{ eventDate: "asc" }, { sortOrder: "asc" }, { plannedStart: "asc" }],
        },
      },
    });

    const events: CampScheduleEvent[] = schedule?.events ?? [];
    const rows = events.map((evt: CampScheduleEvent) => {
      const isMilestone = evt.kind === "MILESTONE";
      const dateStr = format(new Date(evt.eventDate), "yyyy-MM-dd");
      const startTimeStr = format(new Date(evt.effectiveStart), "HH:mm");
      const endTimeStr = !isMilestone && evt.effectiveEnd ? format(new Date(evt.effectiveEnd), "HH:mm") : "";

      return {
        date: dateStr,
        startTime: startTimeStr,
        endDate: dateStr,
        endTime: endTimeStr,
        activity: evt.title,
        facilitator: evt.facilitator ?? "",
        location: evt.location ?? "",
        type: evt.kind,
        notes: evt.notes ?? "",
      };
    });

    if (formatType === "JSON") {
      const jsonContent = JSON.stringify({ program_schedule: rows }, null, 2);
      return {
        fileName: this.fileName(params, formatType),
        mimeType: "application/json",
        data: Buffer.from(jsonContent, "utf-8"),
      };
    }

    if (formatType === "CSV") {
      const csvContent = Papa.unparse(rows);
      return {
        fileName: this.fileName(params, formatType),
        mimeType: "text/csv",
        data: Buffer.from(csvContent, "utf-8"),
      };
    }

    if (formatType === "MD") {
      let md = `# Program Schedule\n\n`;
      md += `| date | startTime | endDate | endTime | activity | facilitator | location | type | notes |\n`;
      md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
      rows.forEach((r) => {
        md += `| ${r.date} | ${r.startTime} | ${r.endDate} | ${r.endTime} | ${r.activity} | ${r.facilitator} | ${r.location} | ${r.type} | ${r.notes} |\n`;
      });

      return {
        fileName: this.fileName(params, formatType),
        mimeType: "text/markdown",
        data: Buffer.from(md, "utf-8"),
      };
    }

    if (formatType === "XLSX") {
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Program Schedule");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      return {
        fileName: this.fileName(params, formatType),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        data: buffer,
      };
    }

    throw new Error(`Unsupported export format ${formatType}`);
  },
};

registerExport(scheduleExportDescriptor);

