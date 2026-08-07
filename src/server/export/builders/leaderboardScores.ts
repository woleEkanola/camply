import { z } from "zod";
import { registerExport } from "../registry";
import { exportUserDataToCsv, exportUserDataToXlsx } from "../../../lib/import-export/serialize";
import { assertCanManageCamp } from "../../api/trpc/scoping";
import type { ExportDescriptor } from "../types";

export interface LeaderboardScoresFilters {
  campId: string;
}

const leaderboardScoresFilterSchema: z.ZodType<LeaderboardScoresFilters> = z.object({
  campId: z.string(),
});

function subjectLabel(
  e: { tribeId: string | null; registrationId: string | null; staffProfileId: string | null; campusId: string | null },
  names: { tribes: Map<string, string>; campers: Map<string, string>; staff: Map<string, string>; campuses: Map<string, string> }
): { type: string; name: string } {
  if (e.tribeId) return { type: "Tribe", name: names.tribes.get(e.tribeId) ?? e.tribeId };
  if (e.registrationId) return { type: "Camper", name: names.campers.get(e.registrationId) ?? e.registrationId };
  if (e.staffProfileId) return { type: "Staff", name: names.staff.get(e.staffProfileId) ?? e.staffProfileId };
  if (e.campusId) return { type: "Campus", name: names.campuses.get(e.campusId) ?? e.campusId };
  return { type: "—", name: "—" };
}

/**
 * Export-only, per the leaderboard closeout plan's explicit "Export now,
 * import later" scope decision — importing raw ScoreEvent history back in
 * would need its own idempotency/dedupe design once the export format has
 * actually been used in practice, not designed speculatively alongside it.
 */
export const leaderboardScoresDescriptor: ExportDescriptor<LeaderboardScoresFilters> = {
  kind: "LEADERBOARD_SCORES",
  label: "Leaderboard Scores",
  formats: ["XLSX", "CSV"],
  presets: [],
  filterSchema: leaderboardScoresFilterSchema,
  async authorize(ctx, params) {
    const filters = params.filters as unknown as LeaderboardScoresFilters;
    await assertCanManageCamp(ctx, filters.campId);
  },
  async count(ctx, params) {
    const filters = params.filters as unknown as LeaderboardScoresFilters;
    return ctx.prisma.scoreEvent.count({ where: { campId: filters.campId } });
  },
  async build(ctx, params, format, onProgress) {
    const filters = params.filters as unknown as LeaderboardScoresFilters;
    await onProgress({ stage: "Fetching score events…" });

    const events = await ctx.prisma.scoreEvent.findMany({
      where: { campId: filters.campId },
      orderBy: { occurredAt: "asc" },
    });

    const categoryIds = [...new Set(events.map((e: any) => e.categoryId))] as string[];
    const [categories, tribes, registrations, staff, campuses] = await Promise.all([
      ctx.prisma.scoreCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }),
      ctx.prisma.tribe.findMany({ where: { id: { in: events.map((e: any) => e.tribeId).filter(Boolean) } }, select: { id: true, name: true } }),
      ctx.prisma.registration.findMany({
        where: { id: { in: events.map((e: any) => e.registrationId).filter(Boolean) } },
        select: { id: true, camper: { select: { name: true } } },
      }),
      ctx.prisma.staffProfile.findMany({
        where: { id: { in: events.map((e: any) => e.staffProfileId).filter(Boolean) } },
        select: { id: true, firstName: true, lastName: true },
      }),
      ctx.prisma.campus.findMany({ where: { id: { in: events.map((e: any) => e.campusId).filter(Boolean) } }, select: { id: true, name: true } }),
    ]);

    const categoryNameById = new Map<string, string>(categories.map((c: any) => [c.id, c.name]));
    const names = {
      tribes: new Map<string, string>(tribes.map((t: any) => [t.id, t.name])),
      campers: new Map<string, string>(registrations.map((r: any) => [r.id, r.camper?.name ?? "Camper"])),
      staff: new Map<string, string>(staff.map((s: any) => [s.id, `${s.firstName} ${s.lastName}`])),
      campuses: new Map<string, string>(campuses.map((c: any) => [c.id, c.name])),
    };

    const total = events.length;
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const subject = subjectLabel(e, names);
      rows.push({
        Date: e.occurredAt.toISOString(),
        "Subject Type": subject.type,
        "Subject Name": subject.name,
        Category: categoryNameById.get(e.categoryId) ?? e.categoryId,
        Points: e.points,
        Source: e.source,
        Reason: e.reason ?? "",
      });
      if (i % 50 === 0 || i === events.length - 1) {
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
    return `camply-leaderboard-scores-${stamp}.${format === "XLSX" ? "xlsx" : "csv"}`;
  },
};

registerExport(leaderboardScoresDescriptor);
