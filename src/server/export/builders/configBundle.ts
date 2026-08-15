import { z } from "zod";
import { registerExport } from "../registry";
import { assertOrgAdmin } from "../../api/trpc/scoping";
import { fetchConfigBundle } from "../../api/routers/importExport";
import { toCsv, toJsonBundle, toMarkdown, toXlsxWorkbook } from "../../../lib/import-export/serialize";
import type { ExportDescriptor } from "../types";

// Config bundles have no meaningful per-page filters (they're org-wide,
// bounded, admin-authored data) — the filter shape is empty on purpose.
export type ConfigBundleFilters = Record<string, never>;

const configBundleFilterSchema: z.ZodType<ConfigBundleFilters> = z.object({});

export const configBundleDescriptor: ExportDescriptor<ConfigBundleFilters> = {
  kind: "CONFIG_BUNDLE",
  label: "Configuration Bundle",
  formats: ["JSON", "XLSX", "CSV", "MD"],
  presets: [],
  filterSchema: configBundleFilterSchema,
  async authorize(ctx, params) {
    await assertOrgAdmin(ctx, params.organizationId);
  },
  async count(ctx, params) {
    const data = await fetchConfigBundle(ctx.prisma, params.organizationId);
    return data.campuses.length + data.tribes.length + data.departments.length;
  },
  async build(ctx, params, format, onProgress) {
    await onProgress({ stage: "Fetching campuses, tribes, departments…" });
    const data = await fetchConfigBundle(ctx.prisma, params.organizationId);
    await onProgress({
      processed: data.campuses.length + data.tribes.length + data.departments.length,
      total: data.campuses.length + data.tribes.length + data.departments.length,
      stage: "Generating file…",
    });

    // Millisecond precision, not just the date — multiple config-bundle
    // exports on the same day (a normal occurrence) previously collided on
    // an identical filename, making them indistinguishable in Job History.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "JSON") {
      const bundle = toJsonBundle(data);
      return {
        fileName: `camply-export-${stamp}.json`,
        mimeType: "application/json",
        data: Buffer.from(JSON.stringify(bundle, null, 2), "utf-8"),
      };
    }
    if (format === "XLSX") {
      const blob = await toXlsxWorkbook(data);
      return { fileName: `camply-export-${stamp}.xlsx`, mimeType: blob.type, data: Buffer.from(await blob.arrayBuffer()) };
    }
    if (format === "MD") {
      return {
        fileName: `camply-export-${stamp}.md`,
        mimeType: "text/markdown",
        data: Buffer.from(toMarkdown(data), "utf-8"),
      };
    }
    // CSV: one entity per row, prefixed, so a single-file download still covers all three —
    // the legacy ExportPanel produced three separate CSV downloads instead; a background job
    // can only return one artifact, so this is a deliberate combined layout, not a regression.
    const combined = [
      "# Campuses", toCsv("campuses", data.campuses),
      "", "# Tribes", toCsv("tribes", data.tribes),
      "", "# Departments", toCsv("departments", data.departments),
    ].join("\n");
    return { fileName: `camply-export-${stamp}.csv`, mimeType: "text/csv", data: Buffer.from(combined, "utf-8") };
  },
  fileName(_params, format) {
    // Millisecond precision, not just the date — multiple config-bundle
    // exports on the same day (a normal occurrence) previously collided on
    // an identical filename, making them indistinguishable in Job History.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `camply-export-${stamp}.${format.toLowerCase()}`;
  },
};

registerExport(configBundleDescriptor);
