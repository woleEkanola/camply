import { z } from "zod";
import { registerExport } from "../registry";
import { authorizeCamperAccess } from "./campers";
import { fetchRoomsWithOccupancy, type RosterRoom } from "../../accommodation/roster";
import type { ExportDescriptor } from "../types";

// A4 in points, matching the convention in acceptanceLetter.ts and sheetPdf.ts.
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const ROW_HEIGHT = 46;

interface DoorSheetFilters {
  campId?: string;
  venueId?: string;
  hostelId?: string;
  floorId?: string;
  roomId?: string;
  gender?: string;
}

const doorSheetFilterSchema: z.ZodType<DoorSheetFilters> = z.object({
  campId: z.string().optional(),
  venueId: z.string().optional(),
  hostelId: z.string().optional(),
  floorId: z.string().optional(),
  roomId: z.string().optional(),
  gender: z.string().optional(),
});

async function buildDoorSheetsPdf(rooms: RosterRoom[]): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.45, 0.45, 0.45);
  const black = rgb(0, 0, 0);

  const stamp = new Date().toLocaleDateString();

  if (rooms.length === 0) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText("No rooms match the requested filters", { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 20, font: bold, size: 14 });
  }

  for (const room of rooms) {
    let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let pageIndex = 1;
    let y = PAGE_HEIGHT - MARGIN;

    const drawHeader = (continued: boolean) => {
      page.drawText(`${room.name}${continued ? " (cont.)" : ""}`, { x: MARGIN, y, font: bold, size: 34 });
      y -= 26;
      const subtitle = [room.hostelName, room.floorName, room.hostelGender].filter(Boolean).join(" · ");
      page.drawText(subtitle, { x: MARGIN, y, font, size: 13, color: grey });
      const occupancyLabel = `Occupied ${room.occupied} of ${room.beds.length} beds`;
      const occupancyWidth = font.widthOfTextAtSize(occupancyLabel, 11);
      page.drawText(occupancyLabel, { x: PAGE_WIDTH - MARGIN - occupancyWidth, y, font, size: 11, color: grey });
      y -= 18;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: black });
      y -= 20;
    };

    const drawFooter = () => {
      page.drawText(`Generated ${stamp} · Camply`, { x: MARGIN, y: MARGIN - 14, font, size: 8, color: grey });
      const pageLabel = `Page ${pageIndex}`;
      const pageWidth = font.widthOfTextAtSize(pageLabel, 8);
      page.drawText(pageLabel, { x: PAGE_WIDTH - MARGIN - pageWidth, y: MARGIN - 14, font, size: 8, color: grey });
    };

    drawHeader(false);

    const ensureSpace = () => {
      if (y < MARGIN + ROW_HEIGHT) {
        drawFooter();
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        pageIndex += 1;
        y = PAGE_HEIGHT - MARGIN;
        drawHeader(true);
      }
    };

    for (const bed of room.beds) {
      ensureSpace();
      page.drawText(bed.label, { x: MARGIN, y, font: bold, size: 12, color: grey });
      const nameX = MARGIN + 90;
      if (bed.occupant) {
        page.drawText(bed.occupant.name.slice(0, 34), { x: nameX, y, font: bold, size: 18 });
        const roleTag = bed.occupant.occupantType !== "CAMPER" ? ` (${bed.occupant.occupantType})` : "";
        if (roleTag) {
          const nameWidth = bold.widthOfTextAtSize(bed.occupant.name.slice(0, 34), 18);
          page.drawText(roleTag, { x: nameX + nameWidth + 4, y, font, size: 10, color: grey });
        }
        const detail = [bed.occupant.tribeName, bed.occupant.campusName].filter(Boolean).join(" · ");
        if (detail) page.drawText(detail.slice(0, 60), { x: nameX, y: y - 16, font, size: 10, color: grey });
      } else {
        page.drawLine({ start: { x: nameX, y: y - 2 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 2 }, thickness: 0.75, color: grey });
      }
      y -= ROW_HEIGHT;
      page.drawLine({ start: { x: MARGIN, y: y + ROW_HEIGHT - 6 }, end: { x: PAGE_WIDTH - MARGIN, y: y + ROW_HEIGHT - 6 }, thickness: 0.25, color: rgb(0.85, 0.85, 0.85) });
    }

    if (room.roomOnlyOccupants.length) {
      ensureSpace();
      page.drawText("Also assigned to this room:", { x: MARGIN, y, font: bold, size: 11 });
      y -= 18;
      for (const occupant of room.roomOnlyOccupants) {
        ensureSpace();
        const roleTag = occupant.occupantType !== "CAMPER" ? ` (${occupant.occupantType})` : "";
        page.drawText(`${occupant.name}${roleTag}`, { x: MARGIN + 12, y, font, size: 12 });
        const detail = [occupant.tribeName, occupant.campusName].filter(Boolean).join(" · ");
        if (detail) page.drawText(detail.slice(0, 60), { x: MARGIN + 12, y: y - 14, font, size: 9, color: grey });
        y -= 30;
      }
    }

    drawFooter();
  }

  return Buffer.from(await doc.save());
}

export const roomDoorSheetsDescriptor: ExportDescriptor<DoorSheetFilters> = {
  kind: "ROOM_DOOR_SHEETS",
  label: "Room Door Sheets",
  formats: ["PDF"],
  presets: [
    { id: "ALL", label: "All Rooms", filters: {} },
    { id: "MALE", label: "Male Hostels", filters: { gender: "MALE" } },
    { id: "FEMALE", label: "Female Hostels", filters: { gender: "FEMALE" } },
  ],
  filterSchema: doorSheetFilterSchema,
  async authorize(ctx, params) {
    await authorizeCamperAccess(ctx, params.organizationId);
  },
  async count(ctx, params) {
    const filters = params.filters as DoorSheetFilters;
    const rooms = await fetchRoomsWithOccupancy(ctx.prisma, params.organizationId, filters);
    return rooms.length;
  },
  async build(ctx, params, _format, onProgress) {
    const filters = params.filters as DoorSheetFilters;
    await onProgress({ stage: "Fetching rooms…" });
    const rooms = await fetchRoomsWithOccupancy(ctx.prisma, params.organizationId, filters);
    await onProgress({ processed: rooms.length, total: rooms.length, stage: "Generating PDF…" });
    const data = await buildDoorSheetsPdf(rooms);
    return { fileName: this.fileName(params, "PDF"), mimeType: "application/pdf", data };
  },
  fileName() {
    const stamp = new Date().toISOString().slice(0, 10);
    return `camply-room-door-sheets-${stamp}.pdf`;
  },
};

registerExport(roomDoorSheetsDescriptor);
