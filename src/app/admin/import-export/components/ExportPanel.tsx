"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "../../../../utils/api";
import { downloadBlob, toCsv, toJsonBundle, toMarkdown, toXlsxWorkbook } from "../../../../lib/import-export/serialize";

type ExportFormat = "json" | "xlsx" | "csv" | "md";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "json", label: "JSON bundle", hint: "Recommended — round-trips perfectly for re-import into another Camply account." },
  { value: "xlsx", label: "Excel workbook (.xlsx)", hint: "One sheet per entity: Campuses, Tribes, Departments." },
  { value: "csv", label: "CSV (per entity)", hint: "Downloads three separate files, one per entity." },
  { value: "md", label: "Markdown (.md)", hint: "Human-readable document with a table per entity." },
];

export function ExportPanel({ organizationId }: { organizationId: string }) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const exportQuery = api.importExport.export.useQuery(
    { organizationId },
    { enabled: false, staleTime: 0 }
  );

  const handleExport = async () => {
    setError("");
    setSuccess("");
    setIsExporting(true);
    try {
      const { data, error: fetchError } = await exportQuery.refetch();
      if (fetchError) throw fetchError;
      if (!data) throw new Error("No data returned from export");

      const stamp = new Date().toISOString().slice(0, 10);

      if (format === "json") {
        const bundle = toJsonBundle(data);
        downloadBlob(`camply-export-${stamp}.json`, new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
      } else if (format === "xlsx") {
        const blob = await toXlsxWorkbook(data);
        downloadBlob(`camply-export-${stamp}.xlsx`, blob);
      } else if (format === "md") {
        downloadBlob(`camply-export-${stamp}.md`, new Blob([toMarkdown(data)], { type: "text/markdown" }));
      } else {
        downloadBlob(`camply-campuses-${stamp}.csv`, new Blob([toCsv("campuses", data.campuses)], { type: "text/csv" }));
        downloadBlob(`camply-tribes-${stamp}.csv`, new Blob([toCsv("tribes", data.tribes)], { type: "text/csv" }));
        downloadBlob(`camply-departments-${stamp}.csv`, new Blob([toCsv("departments", data.departments)], { type: "text/csv" }));
      }

      setSuccess(
        `Exported ${data.campuses.length} campus(es), ${data.tribes.length} tribe(s), ${data.departments.length} department(s).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export campuses, tribes &amp; departments</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-neutral-600">
          Exports every active campus in your organization, every tribe in your active camp, and every department
          (org-wide and active-camp-scoped). Use the JSON bundle if you plan to import this into another account —
          it round-trips with zero editing.
        </p>

        <div className="space-y-2">
          {FORMAT_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-3 rounded-md border border-neutral-200 p-3 text-sm hover:bg-neutral-50">
              <input
                type="radio"
                name="export-format"
                value={opt.value}
                checked={format === opt.value}
                onChange={() => setFormat(opt.value)}
                className="mt-0.5 h-4 w-4 text-accent-600 focus:ring-accent-500"
              />
              <span>
                <span className="block font-medium text-neutral-900">{opt.label}</span>
                <span className="block text-neutral-500">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        {success && <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">{success}</div>}

        <Button onClick={handleExport} loading={isExporting}>
          Export
        </Button>
      </CardBody>
    </Card>
  );
}
