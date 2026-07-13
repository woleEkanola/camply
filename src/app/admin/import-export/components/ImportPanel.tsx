"use client";

import { useRef, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/utils/trpc";
import { detectAndParse } from "../../../../lib/import-export/parse";
import { toImportBundle, validateBundle, type ValidatedBundle } from "../../../../lib/import-export/validate";
import type { EntityKind, ImportResult } from "../../../../lib/import-export/types";

const ENTITY_LABEL: Record<EntityKind, string> = {
  campuses: "Campuses",
  tribes: "Tribes",
  departments: "Departments",
};

function rowLabel(raw: Record<string, unknown>): string {
  const name = raw.name;
  return typeof name === "string" && name.trim() ? name : "(no name)";
}

export function ImportPanel({ organizationId }: { organizationId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entityHint, setEntityHint] = useState<EntityKind | "">("");
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [validated, setValidated] = useState<ValidatedBundle | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const importMutation = api.importExport.import.useMutation({
    onSuccess: (data) => setImportResult(data),
  });

  const totals = validated
    ? (["campuses", "tribes", "departments"] as EntityKind[]).reduce(
        (acc, entity) => {
          for (const row of validated[entity]) {
            if (row.errors.length) acc.invalid++;
            else acc.valid++;
          }
          return acc;
        },
        { valid: 0, invalid: 0 }
      )
    : null;

  const handleFile = async (file: File) => {
    setParseError("");
    setImportResult(null);
    setValidated(null);
    setFileName(file.name);
    try {
      const { bundle } = await detectAndParse(file, entityHint || undefined);
      const { validated: v } = validateBundle(bundle);
      setValidated(v);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not parse this file");
    }
  };

  const handleImport = () => {
    if (!validated) return;
    const bundle = toImportBundle(validated);
    importMutation.mutate({ organizationId, bundle });
  };

  const reset = () => {
    setFileName("");
    setParseError("");
    setValidated(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload a file</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Select
            label="Entity (only needed for ambiguous CSV or single-sheet XLSX files)"
            value={entityHint}
            onChange={(e) => setEntityHint(e.target.value as EntityKind | "")}
            containerClassName="max-w-sm"
          >
            <option value="">Auto-detect from file</option>
            <option value="campuses">Campuses</option>
            <option value="tribes">Tribes</option>
            <option value="departments">Departments</option>
          </Select>

          <div className="rounded-lg border-2 border-dashed border-neutral-300 p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json,.md,.markdown"
              className="hidden"
              id="import-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <label htmlFor="import-file-input" className="cursor-pointer">
              <p className="text-sm font-medium text-neutral-700">
                {fileName || "Click to choose a CSV, XLSX, JSON, or Markdown file"}
              </p>
              <p className="mt-1 text-xs text-neutral-500">See the Format Guide tab for the required columns.</p>
            </label>
          </div>

          {parseError && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{parseError}</div>}
          {fileName && (
            <button onClick={reset} className="text-xs text-neutral-500 underline">
              Clear and choose a different file
            </button>
          )}
        </CardBody>
      </Card>

      {validated && totals && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Preview</CardTitle>
            <span className="text-sm text-neutral-600">
              <span className="font-medium text-success-700">{totals.valid} valid</span>
              {totals.invalid > 0 && (
                <>
                  {", "}
                  <span className="font-medium text-danger-600">{totals.invalid} invalid (will be skipped)</span>
                </>
              )}
            </span>
          </CardHeader>
          <CardBody className="space-y-6">
            {(["campuses", "tribes", "departments"] as EntityKind[]).map((entity) => {
              const rows = validated[entity];
              if (rows.length === 0) return null;
              return (
                <div key={entity}>
                  <h4 className="mb-2 text-sm font-semibold text-neutral-800">
                    {ENTITY_LABEL[entity]} ({rows.length})
                  </h4>
                  <div className="max-h-80 overflow-y-auto rounded-md border border-neutral-200">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-neutral-50">
                        <tr className="text-left text-neutral-500">
                          <th className="px-3 py-2 font-medium">Row</th>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.rowIndex} className="border-t border-neutral-100">
                            <td className="px-3 py-2 text-neutral-500">{row.rowIndex + 1}</td>
                            <td className="px-3 py-2 text-neutral-800">{rowLabel(row.raw)}</td>
                            <td className="px-3 py-2">
                              {row.errors.length === 0 ? (
                                <Badge tone="success">Valid</Badge>
                              ) : (
                                <div className="space-y-1">
                                  <Badge tone="danger">Invalid</Badge>
                                  <ul className="list-disc pl-4 text-xs text-danger-600">
                                    {row.errors.map((msg, i) => (
                                      <li key={i}>{msg}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {importMutation.error && (
              <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{importMutation.error.message}</div>
            )}

            <Button onClick={handleImport} loading={importMutation.isPending} disabled={totals.valid === 0}>
              Import {totals.valid} row{totals.valid === 1 ? "" : "s"}
            </Button>
          </CardBody>
        </Card>
      )}

      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle>Import results</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {(["campuses", "tribes", "departments"] as EntityKind[]).map((entity) => {
              const result = importResult[entity];
              if (!result) return null;
              return (
                <div key={entity}>
                  <h4 className="mb-1 text-sm font-semibold text-neutral-800">{ENTITY_LABEL[entity]}</h4>
                  <p className="text-sm text-neutral-600">
                    {result.created} created, {result.updated} updated
                    {result.errors.length > 0 && `, ${result.errors.length} failed`}
                  </p>
                  {result.warnings.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-warning-700">
                      {result.warnings.map((w, i) => (
                        <li key={i}>
                          Row {w.rowIndex + 1} ({w.name}): {w.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.errors.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-danger-600">
                      {result.errors.map((e, i) => (
                        <li key={i}>
                          Row {e.rowIndex + 1} ({e.name}): {e.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
