import { z } from "zod";
import { registerExport } from "../registry";
import {
  assertReportsAccess,
  resolveReportCampId,
  computeMealReport,
  computeArrivalsReport,
  computeCollectiblesReport,
} from "../../api/routers/scan";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import type { ExportDescriptor } from "../types";

export interface ReportFilters {
  campId?: string;
  date?: string; // ISO yyyy-mm-dd
  stationId?: "CAMP_ARRIVAL" | "HOSTEL_ARRIVAL" | "PICKUP_POINT";
}

const reportFilterSchema: z.ZodType<ReportFilters> = z.object({
  campId: z.string().optional(),
  date: z.string().optional(),
  stationId: z.enum(["CAMP_ARRIVAL", "HOSTEL_ARRIVAL", "PICKUP_POINT"]).optional(),
});

async function fetchReportData(ctx: { prisma: any }, organizationId: string, filters: ReportFilters) {
  const campId = await resolveReportCampId(ctx, organizationId, filters.campId);
  const date = filters.date ? new Date(filters.date) : undefined;
  const [meals, arrivals, collectibles] = await Promise.all([
    computeMealReport(ctx.prisma, campId, date),
    computeArrivalsReport(ctx.prisma, campId, date, filters.stationId),
    computeCollectiblesReport(ctx.prisma, campId, date),
  ]);
  return { meals, arrivals, collectibles, date: date ?? new Date() };
}

function reportRows(data: Awaited<ReturnType<typeof fetchReportData>>): Record<string, any>[] {
  const rows: Record<string, any>[] = [
    { Section: "Meals", Item: "Breakfast", Count: data.meals.breakfast },
    { Section: "Meals", Item: "Lunch", Count: data.meals.lunch },
    { Section: "Meals", Item: "Dinner", Count: data.meals.dinner },
  ];
  for (const r of data.arrivals.rows) {
    rows.push({ Section: "Arrivals", Item: `${r.station} (${r.stationId})`, Count: r.count });
  }
  for (const r of data.collectibles.rows) {
    rows.push({ Section: "Collectibles", Item: r.station, Count: r.count });
  }
  return rows;
}

async function reportPdf(data: Awaited<ReturnType<typeof fetchReportData>>): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  let y = 800;

  page.drawText("Operations Report", { x: 40, y, font: bold, size: 16 });
  y -= 20;
  page.drawText(`For ${data.date.toISOString().slice(0, 10)} — generated ${new Date().toISOString()}`, {
    x: 40, y, font, size: 9, color: rgb(0.4, 0.4, 0.4),
  });
  y -= 30;

  const section = (title: string, rows: { label: string; value: number }[], total?: number) => {
    page.drawText(title, { x: 40, y, font: bold, size: 12 });
    y -= 18;
    for (const r of rows) {
      page.drawText(r.label, { x: 50, y, font, size: 10 });
      page.drawText(String(r.value), { x: 400, y, font, size: 10 });
      y -= 16;
    }
    if (total !== undefined) {
      page.drawText("Total", { x: 50, y, font: bold, size: 10 });
      page.drawText(String(total), { x: 400, y, font: bold, size: 10 });
      y -= 16;
    }
    y -= 10;
  };

  section("Meals", [
    { label: "Breakfast", value: data.meals.breakfast },
    { label: "Lunch", value: data.meals.lunch },
    { label: "Dinner", value: data.meals.dinner },
  ]);
  section(
    "Arrivals",
    data.arrivals.rows.map((r) => ({ label: `${r.station} (${r.stationId})`, value: r.count })),
    data.arrivals.total
  );
  section(
    "Collectibles",
    data.collectibles.rows.map((r: { station: string; count: number }) => ({ label: r.station, value: r.count })),
    data.collectibles.total
  );

  return Buffer.from(await doc.save());
}

export const reportsDescriptor: ExportDescriptor<ReportFilters> = {
  kind: "REPORT_OPERATIONS",
  label: "Operations Report",
  formats: ["PDF", "XLSX", "CSV"],
  presets: [{ id: "TODAY", label: "Today", filters: {} }],
  filterSchema: reportFilterSchema,
  async authorize(ctx, params) {
    await assertReportsAccess(ctx, params.organizationId);
  },
  async count(ctx, params) {
    const data = await fetchReportData(ctx, params.organizationId, params.filters as ReportFilters);
    return reportRows(data).length;
  },
  async build(ctx, params, format, onProgress) {
    await onProgress({ stage: "Fetching report data…" });
    const data = await fetchReportData(ctx, params.organizationId, params.filters as ReportFilters);
    await onProgress({ processed: 1, total: 1, stage: "Generating file…" });

    const stamp = data.date.toISOString().slice(0, 10);
    if (format === "PDF") {
      const pdf = await reportPdf(data);
      return { fileName: `camply-operations-report-${stamp}.pdf`, mimeType: "application/pdf", data: pdf };
    }
    const rows = reportRows(data);
    if (format === "XLSX") {
      const blob = await exportUserDataToXlsx(rows);
      return { fileName: `camply-operations-report-${stamp}.xlsx`, mimeType: blob.type, data: Buffer.from(await blob.arrayBuffer()) };
    }
    const csv = exportUserDataToCsv(rows);
    return { fileName: `camply-operations-report-${stamp}.csv`, mimeType: "text/csv", data: Buffer.from(csv, "utf-8") };
  },
  fileName(params, format) {
    const filters = params.filters as ReportFilters;
    const stamp = filters.date ?? new Date().toISOString().slice(0, 10);
    return `camply-operations-report-${stamp}.${format.toLowerCase()}`;
  },
};

registerExport(reportsDescriptor);
