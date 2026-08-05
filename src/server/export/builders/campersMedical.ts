import { z } from "zod";
import { registerExport } from "../registry";
import { assertOrgAdmin } from "../../api/trpc/scoping";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import type { CamperFilters } from "./campers";
import type { ExportDescriptor } from "../types";

export interface MedicalFilters extends CamperFilters {
  hasAnyMedicalInfo?: boolean;
  hasAllergies?: boolean;
  hasMedicalConditions?: boolean;
  hasMedications?: boolean;
  hasDietaryRestrictions?: boolean;
  missingEmergencyContact?: boolean;
}

const medicalFilterSchema: z.ZodType<MedicalFilters> = z.object({
  campId: z.string().optional(),
  campusId: z.string().optional(),
  gender: z.string().optional(),
  tribeId: z.string().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  hasAnyMedicalInfo: z.boolean().optional(),
  hasAllergies: z.boolean().optional(),
  hasMedicalConditions: z.boolean().optional(),
  hasMedications: z.boolean().optional(),
  hasDietaryRestrictions: z.boolean().optional(),
  missingEmergencyContact: z.boolean().optional(),
});

const NON_EMPTY = { not: null, notIn: [""] as any };

function medicalWhere(organizationId: string, filters: MedicalFilters, ids?: string[]) {
  const where: Record<string, any> = { organizationId, deletedAt: null };
  if (ids?.length) where.id = { in: ids };
  if (filters.campusId) where.homeCampusId = filters.campusId;
  if (filters.gender) where.gender = filters.gender;

  const and: Record<string, any>[] = [];
  if (filters.status || filters.campId || filters.tribeId) {
    and.push({
      registrations: {
        some: {
          ...(filters.status ? { status: filters.status as any } : {}),
          ...(filters.campId ? { campId: filters.campId } : {}),
          ...(filters.tribeId ? { tribeId: filters.tribeId } : {}),
        },
      },
    });
  }
  if (filters.hasAnyMedicalInfo) {
    and.push({
      OR: [
        { allergies: NON_EMPTY },
        { medicalConditions: NON_EMPTY },
        { medications: NON_EMPTY },
        { dietaryRestrictions: NON_EMPTY },
        { medicalProfile: { not: null } },
      ],
    });
  }
  if (filters.hasAllergies) and.push({ allergies: NON_EMPTY });
  if (filters.hasMedicalConditions) and.push({ medicalConditions: NON_EMPTY });
  if (filters.hasMedications) and.push({ medications: NON_EMPTY });
  if (filters.hasDietaryRestrictions) and.push({ dietaryRestrictions: NON_EMPTY });
  if (filters.missingEmergencyContact) {
    and.push({ OR: [{ emergencyContactName: null }, { emergencyContactName: "" }] });
  }
  if (and.length) where.AND = and;
  return where;
}

async function fetchMedicalCampers(ctx: { prisma: any }, organizationId: string, filters: MedicalFilters, ids?: string[]) {
  return ctx.prisma.camper.findMany({
    where: medicalWhere(organizationId, filters, ids),
    include: {
      registrations: {
        where: {
          ...(filters.status ? { status: filters.status as any } : {}),
          ...(filters.campId ? { campId: filters.campId } : {}),
          ...(filters.tribeId ? { tribeId: filters.tribeId } : {}),
        },
        include: { campus: true, tribe: true, room: true, bed: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

function medicalRow(camper: any) {
  const reg = camper.registrations?.[0];
  return {
    "Camper Name": camper.name,
    "Registration Number": reg?.registrationNumber || "",
    Campus: reg?.campus?.name || "",
    Tribe: reg?.tribe?.name || "",
    Room: reg?.room?.name || "",
    Bed: reg?.bed?.label || "",
    "Parent Phone": camper.parentPhone || "",
    "Emergency Contact": [camper.emergencyContactName, camper.emergencyContactPhone].filter(Boolean).join(" — "),
    Allergies: camper.allergies || "",
    "Medical Conditions": camper.medicalConditions || "",
    Medications: camper.medications || "",
    "Dietary Restrictions": camper.dietaryRestrictions || "",
    "Medical Notes": camper.medicalProfile ? JSON.stringify(camper.medicalProfile) : "",
  };
}

async function medicalPdf(rows: Record<string, any>[]): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const columns = ["Camper Name", "Campus", "Tribe", "Allergies", "Medical Conditions", "Medications"];
  const colWidth = 90;
  const rowHeight = 16;
  let page = doc.addPage([595, 842]);
  let y = 800;

  const drawHeader = () => {
    page.drawText("Medical Summary", { x: 40, y, font: bold, size: 14 });
    y -= 24;
    columns.forEach((c, i) => page.drawText(c, { x: 40 + i * colWidth, y, font: bold, size: 8 }));
    y -= rowHeight;
  };
  drawHeader();

  for (const row of rows) {
    if (y < 60) {
      page = doc.addPage([595, 842]);
      y = 800;
      drawHeader();
    }
    columns.forEach((c, i) => {
      const text = String(row[c] ?? "").slice(0, 20);
      page.drawText(text, { x: 40 + i * colWidth, y, font, size: 7, color: rgb(0.1, 0.1, 0.1) });
    });
    y -= rowHeight;
  }

  return Buffer.from(await doc.save());
}

export const campersMedicalDescriptor: ExportDescriptor<MedicalFilters> = {
  kind: "CAMPERS_MEDICAL",
  label: "Medical Summary",
  formats: ["XLSX", "CSV", "PDF"],
  presets: [{ id: "HAS_ANY_MEDICAL", label: "Has Any Medical Information", filters: { hasAnyMedicalInfo: true } }],
  filterSchema: medicalFilterSchema,
  // Medical exports are role-only (OWNER/ADMIN/SUPER_ADMIN) — not campus-rep or
  // staff-eligible like the plain CAMPERS kind. See plan decision on medical access.
  async authorize(ctx, params) {
    await assertOrgAdmin(ctx, params.organizationId);
  },
  async count(ctx, params) {
    const filters = params.filters as MedicalFilters;
    return ctx.prisma.camper.count({
      where: medicalWhere(params.organizationId, filters, params.scope === "SELECTED" ? params.selectedIds : undefined),
    });
  },
  async build(ctx, params, format, onProgress) {
    const filters = params.filters as MedicalFilters;
    const ids = params.scope === "SELECTED" ? params.selectedIds : undefined;
    await onProgress({ stage: "Fetching campers…" });
    const campers = await fetchMedicalCampers(ctx, params.organizationId, filters, ids);
    const total = campers.length;
    const rows = campers.map((c: any, i: number) => {
      if (i % 50 === 0) void onProgress({ processed: i + 1, total, stage: "Building rows…" });
      return medicalRow(c);
    });
    await onProgress({ processed: total, total, stage: "Building rows…" });

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "PDF") {
      await onProgress({ stage: "Generating PDF…" });
      const data = await medicalPdf(rows);
      return { fileName: `camply-medical-summary-${stamp}.pdf`, mimeType: "application/pdf", data };
    }
    if (format === "XLSX") {
      await onProgress({ stage: "Generating workbook…" });
      const blob = await exportUserDataToXlsx(rows);
      return { fileName: `camply-medical-summary-${stamp}.xlsx`, mimeType: blob.type, data: Buffer.from(await blob.arrayBuffer()) };
    }
    await onProgress({ stage: "Generating CSV…" });
    const csv = exportUserDataToCsv(rows);
    return { fileName: `camply-medical-summary-${stamp}.csv`, mimeType: "text/csv", data: Buffer.from(csv, "utf-8") };
  },
  fileName(_params, format) {
    const stamp = new Date().toISOString().slice(0, 10);
    return `camply-medical-summary-${stamp}.${format.toLowerCase()}`;
  },
};

registerExport(campersMedicalDescriptor);
