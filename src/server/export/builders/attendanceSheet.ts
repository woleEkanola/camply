import { z } from "zod";
import { registerExport } from "../registry";
import { authorizeCamperAccess } from "./campers";
import type { CamperFilters } from "./campers";
import type { ExportDescriptor } from "../types";

// A4 in points, matching the convention in acceptanceLetter.ts and sheetPdf.ts.
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const ROW_HEIGHT = 26;
const COLUMNS = [
  { label: "Photo", width: 40 },
  { label: "Camper Name", width: 150 },
  { label: "Tribe", width: 90 },
  { label: "Room", width: 90 },
  { label: "Signature", width: 110 },
  { label: "Check-in Status", width: 95 },
];

const attendanceFilterSchema: z.ZodType<CamperFilters> = z.object({
  campId: z.string().optional(),
  campusId: z.string().optional(),
  gender: z.string().optional(),
  tribeId: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
});

function registrationWhere(organizationId: string, filters: CamperFilters, ids?: string[]) {
  const where: Record<string, any> = { camper: { organizationId, deletedAt: null }, deletedAt: null };
  if (ids?.length) where.id = { in: ids };
  if (filters.campusId) where.campusId = filters.campusId;
  if (filters.campId) where.campId = filters.campId;
  if (filters.tribeId) where.tribeId = filters.tribeId;
  if (filters.status) where.status = filters.status as any;
  return where;
}

async function attendanceSheetPdf(rows: { name: string; tribe: string; room: string; checkedIn: boolean }[]): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawHeader = () => {
    page.drawText("Attendance Sheet", { x: MARGIN, y, font: bold, size: 14 });
    y -= 24;
    let x = MARGIN;
    for (const col of COLUMNS) {
      page.drawText(col.label, { x, y, font: bold, size: 9 });
      x += col.width;
    }
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    y -= ROW_HEIGHT - 6;
  };
  drawHeader();

  for (const row of rows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawHeader();
    }
    let x = MARGIN;
    // Photo column left blank for a physical check mark/sticker at the desk.
    x += COLUMNS[0].width;
    page.drawText(row.name.slice(0, 28), { x, y, font, size: 9 });
    x += COLUMNS[1].width;
    page.drawText(row.tribe.slice(0, 16), { x, y, font, size: 9 });
    x += COLUMNS[2].width;
    page.drawText(row.room.slice(0, 16), { x, y, font, size: 9 });
    x += COLUMNS[3].width;
    // Signature column left blank for a physical signature.
    x += COLUMNS[4].width;
    page.drawText(row.checkedIn ? "Checked In" : "—", { x, y, font, size: 9 });

    y -= ROW_HEIGHT;
    page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 6 }, thickness: 0.25, color: rgb(0.8, 0.8, 0.8) });
  }

  return Buffer.from(await doc.save());
}

export const attendanceSheetDescriptor: ExportDescriptor<CamperFilters> = {
  kind: "ATTENDANCE_SHEET",
  label: "Attendance Sheet",
  formats: ["PDF"],
  presets: [
    { id: "ALL", label: "All Campers", filters: {} },
    { id: "APPROVED", label: "Approved Campers", filters: { status: "APPROVED" } },
  ],
  filterSchema: attendanceFilterSchema,
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
    const registrations = await ctx.prisma.registration.findMany({
      where: registrationWhere(params.organizationId, filters, ids),
      include: { camper: true, tribe: true, room: true },
      orderBy: [{ tribe: { name: "asc" } }, { camper: { name: "asc" } }],
    });

    const total = registrations.length;
    const rows = registrations.map((r: any, i: number) => {
      if (i % 50 === 0) void onProgress({ processed: i + 1, total, stage: "Building rows…" });
      return {
        name: r.camper.name,
        tribe: r.tribe?.name ?? "—",
        room: r.room?.name ?? "—",
        checkedIn: !!r.checkedInAt,
      };
    });
    await onProgress({ processed: total, total, stage: "Generating PDF…" });

    const data = await attendanceSheetPdf(rows);
    return { fileName: this.fileName(params, "PDF"), mimeType: "application/pdf", data };
  },
  fileName() {
    const stamp = new Date().toISOString().slice(0, 10);
    return `camply-attendance-sheet-${stamp}.pdf`;
  },
};

registerExport(attendanceSheetDescriptor);
