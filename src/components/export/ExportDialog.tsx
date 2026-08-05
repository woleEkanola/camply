"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { ExportFormat } from "@/server/export/types";
import type { UseExportReturn } from "./useExport";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  XLSX: "Excel (.xlsx)",
  CSV: "CSV",
  JSON: "JSON",
  MD: "Markdown",
  PDF: "PDF",
};

// Rough per-record byte cost by format, used only for the dialog's estimated-size hint.
const BYTES_PER_RECORD: Record<ExportFormat, number> = {
  XLSX: 220,
  CSV: 140,
  JSON: 260,
  MD: 160,
  PDF: 4500,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function isEmptyFilterValue(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

export function ExportDialog(state: UseExportReturn) {
  const {
    open,
    closeDialog,
    scope,
    setScope,
    presetId,
    selectPreset,
    format,
    setFormat,
    describe,
    estimate,
    isEstimating,
    submit,
    isSubmitting,
    hasSelection,
    selectedCount,
    currentFilters,
  } = state;

  const activeFilterEntries = Object.entries(currentFilters).filter(([, v]) => !isEmptyFilterValue(v));

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      title={describe ? `Export ${describe.label}` : "Export"}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={closeDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={isSubmitting} disabled={!format}>
            Export
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {activeFilterEntries.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-txt-muted">Current Filter</p>
            <div className="flex flex-wrap gap-1.5">
              {activeFilterEntries.map(([key, value]) => (
                <Badge key={key} tone="info">
                  {humanizeKey(key)}: {Array.isArray(value) ? value.join(", ") : String(value)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase text-txt-muted">Scope</p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-txt-primary">
              <input
                type="radio"
                name="export-scope"
                checked={scope === "CURRENT_FILTER"}
                onChange={() => setScope("CURRENT_FILTER")}
                className="h-4 w-4 text-accent-600 focus:ring-accent-500"
              />
              Export current filtered results
            </label>
            <label className="flex items-center gap-2 text-sm text-txt-primary">
              <input
                type="radio"
                name="export-scope"
                checked={scope === "ALL"}
                onChange={() => setScope("ALL")}
                className="h-4 w-4 text-accent-600 focus:ring-accent-500"
              />
              All matching records
            </label>
            {hasSelection && (
              <label className="flex items-center gap-2 text-sm text-txt-primary">
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === "SELECTED"}
                  onChange={() => setScope("SELECTED")}
                  className="h-4 w-4 text-accent-600 focus:ring-accent-500"
                />
                Selected records ({selectedCount})
              </label>
            )}
          </div>
        </div>

        {!!describe?.presets.length && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-txt-muted">Preset</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => selectPreset(undefined)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  !presetId
                    ? "border-accent-600 bg-accent-50 text-accent-700"
                    : "border-border-default text-txt-secondary hover:bg-surface-raised"
                }`}
              >
                None
              </button>
              {describe.presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    presetId === p.id
                      ? "border-accent-600 bg-accent-50 text-accent-700"
                      : "border-border-default text-txt-secondary hover:bg-surface-raised"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!!describe?.formats.length && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-txt-muted">Format</p>
            <div className="flex flex-wrap gap-2">
              {describe.formats.map((f) => (
                <label
                  key={f}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    format === f ? "border-accent-600 bg-accent-50" : "border-border-default hover:bg-surface-raised"
                  }`}
                >
                  <input
                    type="radio"
                    name="export-format"
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="h-4 w-4 text-accent-600 focus:ring-accent-500"
                  />
                  {FORMAT_LABELS[f]}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-md border border-border-default bg-surface-raised p-3 text-sm">
          {isEstimating ? (
            <p className="text-txt-muted">Estimating…</p>
          ) : estimate ? (
            <div className="space-y-0.5 text-txt-secondary">
              <p className="font-medium text-txt-primary">
                {estimate.count} record{estimate.count === 1 ? "" : "s"}
              </p>
              {format && <p>{FORMAT_LABELS[format]}</p>}
              {format && (
                <p>Estimated size: ~{formatBytes(estimate.count * BYTES_PER_RECORD[format])}</p>
              )}
            </div>
          ) : (
            <p className="text-txt-muted">—</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
