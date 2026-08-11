"use client";

import { useState } from "react";
import { ArrowDownTrayIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { ExportKind } from "@/server/export/types";
import { useExport } from "./useExport";
import { ExportDialog } from "./ExportDialog";

export interface ExportMenuOption {
  kind: ExportKind;
  /** Shown as the type-picker row label and passed through as useExport's `label`. */
  label: string;
  description?: string;
}

export interface ExportMenuButtonProps extends Omit<ButtonProps, "onClick"> {
  organizationId: string;
  options: ExportMenuOption[];
  filters?: Record<string, unknown>;
  selectedIds?: string[];
}

/**
 * Single "Export" entry point for a page with several export kinds —
 * replaces mounting one <ExportButton> per kind (which crowds the toolbar,
 * worse on mobile where they wrap into their own row). Opens a small type
 * picker first; picking an option hands off straight into that kind's
 * existing ExportDialog, unchanged. Every kind's useExport/ExportDialog
 * pair is still mounted (cheap — their queries are gated on `open`), so
 * this is purely a UI wrapper, not a change to the export system itself.
 */
export function ExportMenuButton({ organizationId, options, filters = {}, selectedIds, children, ...buttonProps }: ExportMenuButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // Fixed-length, fixed-order list of kinds per page — safe to call one
  // useExport per option in a stable array rather than conditionally.
  const states = options.map((opt) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useExport({ kind: opt.kind, organizationId, label: opt.label, filters, selectedIds })
  );

  return (
    <>
      <Button variant="secondary" icon={<ArrowDownTrayIcon className="h-4 w-4" />} {...buttonProps} onClick={() => setPickerOpen(true)}>
        {children ?? "Export"}
      </Button>

      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} title="What would you like to export?" size="sm" testId="export-picker-panel">
        <div className="space-y-2">
          {options.map((opt, i) => (
            <button
              key={opt.kind}
              type="button"
              aria-label={opt.label}
              onClick={() => {
                setPickerOpen(false);
                states[i].openDialog();
              }}
              className="flex w-full items-center justify-between rounded-xl border border-border-default bg-surface p-3 text-left transition hover:border-accent-300 hover:bg-accent-50"
            >
              <div>
                <div className="text-sm font-bold text-txt-primary">{opt.label}</div>
                {opt.description && <div className="text-xs text-txt-secondary">{opt.description}</div>}
              </div>
              <ChevronRightIcon className="h-4 w-4 text-txt-muted" />
            </button>
          ))}
        </div>
      </Dialog>

      {states.map((state, i) => (
        <ExportDialog key={options[i].kind} {...state} />
      ))}
    </>
  );
}
