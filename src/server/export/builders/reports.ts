import { z } from "zod";
import { registerExport } from "../registry";
import {
  assertReportsAccess,
  resolveReportCampId,
  computeComprehensiveStationReport,
} from "../../api/routers/scan";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import type { ExportDescriptor } from "../types";

export interface ReportFilters {
  campId?: string;
  date?: string; // ISO yyyy-mm-dd
  stationId?: string;
}

const reportFilterSchema: z.ZodType<ReportFilters> = z.object({
  campId: z.string().optional(),
  date: z.string().optional(),
  stationId: z.string().optional(),
});

async function fetchReportData(ctx: { prisma: any }, organizationId: string, filters: ReportFilters) {
  const campId = await resolveReportCampId(ctx, organizationId, filters.campId);
  const date = filters.date ? new Date(filters.date) : undefined;
  const report = await computeComprehensiveStationReport(ctx.prisma, campId, date);
  return { report, date: date ?? new Date() };
}

function reportRows(data: Awaited<ReturnType<typeof fetchReportData>>): Record<string, any>[] {
  const { report } = data;
  const rows: Record<string, any>[] = [
    // Overview
    { Section: "Overview", Item: "Total Registered", Count: report.overview.registered },
    { Section: "Overview", Item: "Checked In (In-Camp)", Count: report.overview.checkedIn },
    { Section: "Overview", Item: "Pending Arrival", Count: report.overview.pendingArrival },
    { Section: "Overview", Item: "Total Boarded Bus", Count: report.overview.totalBoarded },
    { Section: "Overview", Item: "Hostel Checked In", Count: report.overview.totalHostelCheckedIn },
    { Section: "Overview", Item: "Released / Departed", Count: report.overview.checkedOutCount },
    { Section: "Overview", Item: "Remaining In Camp", Count: report.overview.stillInCamp },

    // Meals
    { Section: "Meals", Item: "Breakfast — Total", Count: report.meals.breakfast },
    { Section: "Meals", Item: "Breakfast — Campers", Count: report.meals.camper.breakfast },
    { Section: "Meals", Item: "Breakfast — Staff", Count: report.meals.staff.breakfast },
    { Section: "Meals", Item: "Lunch — Total", Count: report.meals.lunch },
    { Section: "Meals", Item: "Lunch — Campers", Count: report.meals.camper.lunch },
    { Section: "Meals", Item: "Lunch — Staff", Count: report.meals.staff.lunch },
    { Section: "Meals", Item: "Dinner — Total", Count: report.meals.dinner },
    { Section: "Meals", Item: "Dinner — Campers", Count: report.meals.camper.dinner },
    { Section: "Meals", Item: "Dinner — Staff", Count: report.meals.staff.dinner },
  ];

  // Camp Arrivals
  for (const r of report.campArrivals.rows) {
    rows.push({ Section: "Camp Arrivals", Item: r.station, Count: r.count });
  }

  // Bus Boarding
  for (const r of report.busBoarding.rows) {
    rows.push({ Section: "Bus Boarding", Item: r.station, Count: r.count });
  }

  // Hostel Check-ins
  for (const r of report.hostelArrivals.rows) {
    rows.push({ Section: "Hostel Check-in", Item: r.station, Count: r.count });
  }

  // Collectibles
  for (const r of report.collectibles.rows) {
    rows.push({ Section: "Collectibles", Item: r.station, Count: r.count });
  }

  // Checkout
  for (const r of report.checkout.rows) {
    rows.push({
      Section: "Checkout / Releases",
      Item: `${r.camperName} (${r.registrationNumber})`,
      Count: 1,
      Collector: `${r.collectorName} (${r.collectorRelationship})`,
      Time: r.time,
    });
  }

  // Staff Presence
  for (const r of report.staffPresence.rows) {
    rows.push({
      Section: "Staff Presence",
      Item: `${r.name} (${r.role})`,
      Count: 1,
      Action: r.action,
      Time: r.time,
    });
  }

  // Lookups
  rows.push({ Section: "Security & Lookups", Item: "Identity Lookups", Count: report.lookups.identityLookups });
  rows.push({ Section: "Security & Lookups", Item: "Emergency Lookups", Count: report.lookups.emergencyLookups });

  return rows;
}

async function reportPdf(data: Awaited<ReturnType<typeof fetchReportData>>): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  let y = 800;

  page.drawText("Camply Operations & Station Report", { x: 40, y, font: bold, size: 16 });
  y -= 20;
  page.drawText(`For ${data.date.toISOString().slice(0, 10)} — generated ${new Date().toISOString()}`, {
    x: 40,
    y,
    font,
    size: 9,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 30;

  const section = (title: string, rows: { label: string; value: number }[], total?: number) => {
    if (y < 80) return; // avoid overflow
    page.drawText(title, { x: 40, y, font: bold, size: 12 });
    y -= 18;
    for (const r of rows) {
      if (y < 60) break;
      page.drawText(r.label, { x: 50, y, font, size: 10 });
      page.drawText(String(r.value), { x: 420, y, font, size: 10 });
      y -= 16;
    }
    if (total !== undefined && y >= 60) {
      page.drawText("Total", { x: 50, y, font: bold, size: 10 });
      page.drawText(String(total), { x: 420, y, font, size: 10 });
      y -= 16;
    }
    y -= 10;
  };

  const { report } = data;

  section("Camp Overview & Headcount", [
    { label: "Total Registered Campers", value: report.overview.registered },
    { label: "Checked In at Camp", value: report.overview.checkedIn },
    { label: "Pending Camp Arrival", value: report.overview.pendingArrival },
    { label: "Boarded Bus (Pickup Points)", value: report.overview.totalBoarded },
    { label: "Hostel Checked In", value: report.overview.totalHostelCheckedIn },
    { label: "Released / Departed", value: report.overview.checkedOutCount },
    { label: "Currently in Camp", value: report.overview.stillInCamp },
  ]);

  section("Meals Distribution", [
    { label: "Breakfast", value: report.meals.breakfast },
    { label: "Lunch", value: report.meals.lunch },
    { label: "Dinner", value: report.meals.dinner },
  ]);

  section(
    "Camp Arrivals",
    report.campArrivals.rows.map((r) => ({ label: r.station, value: r.count })),
    report.campArrivals.total
  );

  section(
    "Bus Boarding (Pickup Points)",
    report.busBoarding.rows.map((r) => ({ label: r.station, value: r.count })),
    report.busBoarding.total
  );

  section(
    "Collectibles",
    report.collectibles.rows.map((r: { station: string; count: number }) => ({ label: r.station, value: r.count })),
    report.collectibles.total
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
