import { z } from "zod";
import { registerExport } from "../registry";
import { authorizeCamperAccess } from "./campers";
import { fetchRoomingOccupants, type RosterFilters } from "../../accommodation/roster";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import type { ExportDescriptor } from "../types";

const roomingListFilterSchema: z.ZodType<RosterFilters> = z.object({
  campId: z.string().optional(),
  venueId: z.string().optional(),
  hostelId: z.string().optional(),
  floorId: z.string().optional(),
  roomId: z.string().optional(),
  gender: z.string().optional(),
  tribeId: z.string().optional(),
  campusId: z.string().optional(),
  status: z.string().optional(),
  occupantType: z.enum(["CAMPER", "TEACHER", "VOLUNTEER", "STAFF"]).optional(),
  search: z.string().optional(),
});

function buildRow(occupant: Awaited<ReturnType<typeof fetchRoomingOccupants>>[number]) {
  return {
    Hostel: occupant.hostelName ?? "",
    Floor: occupant.floorName ?? "",
    Room: occupant.roomName ?? "",
    Bed: occupant.bedLabel ?? "",
    "Room Capacity": occupant.roomCapacity ?? "",
    "Occupant Type": occupant.occupantType,
    Name: occupant.name,
    Gender: occupant.gender ?? "",
    Age: occupant.age ?? "",
    Tribe: occupant.tribeName ?? "",
    Campus: occupant.campusName ?? "",
    Venue: occupant.venueName ?? "",
    "Registration #": occupant.registrationNumber ?? "",
    "Registration Status": occupant.registrationStatus ?? "",
    Phone: occupant.phone ?? "",
    Flags: occupant.flags.join("; "),
  };
}

export const roomingListDescriptor: ExportDescriptor<RosterFilters> = {
  kind: "ROOMING_LIST",
  label: "Rooming List",
  formats: ["XLSX", "CSV"],
  presets: [
    { id: "ALL", label: "All Occupants", filters: {} },
    { id: "CAMPERS", label: "Campers Only", filters: { occupantType: "CAMPER" } },
    { id: "STAFF", label: "Staff Only", filters: { occupantType: "STAFF" } },
    { id: "FLAGGED", label: "Flagged for Correction", filters: {} },
  ],
  filterSchema: roomingListFilterSchema,
  async authorize(ctx, params) {
    await authorizeCamperAccess(ctx, params.organizationId, (params.filters as RosterFilters)?.campusId);
  },
  async count(ctx, params) {
    const filters = params.filters as RosterFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    let occupants = await fetchRoomingOccupants(ctx.prisma, params.organizationId, filters, ids);
    if (params.presetId === "FLAGGED") occupants = occupants.filter((o) => o.flags.length > 0);
    return occupants.length;
  },
  async build(ctx, params, format, onProgress) {
    const filters = params.filters as RosterFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    await onProgress({ stage: "Fetching occupants…" });
    let occupants = await fetchRoomingOccupants(ctx.prisma, params.organizationId, filters, ids);
    if (params.presetId === "FLAGGED") occupants = occupants.filter((o) => o.flags.length > 0);

    const total = occupants.length;
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < occupants.length; i++) {
      rows.push(buildRow(occupants[i]));
      if (i % 50 === 0 || i === occupants.length - 1) {
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
    return `camply-rooming-list-${stamp}.${format === "XLSX" ? "xlsx" : "csv"}`;
  },
};

registerExport(roomingListDescriptor);
