"use client";

import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { Button, type ButtonProps } from "@/components/ui/Button";
import type { ExportKind } from "@/server/export/types";
import { useExport } from "./useExport";
import { ExportDialog } from "./ExportDialog";

export interface ExportButtonProps extends Omit<ButtonProps, "onClick"> {
  kind: ExportKind;
  organizationId: string;
  /** Shown in the Export Center and success toast, e.g. "Campers". */
  label: string;
  /** The page's current filters — read-only "Current Filter" chips, and the CURRENT_FILTER scope's filter set. */
  filters?: Record<string, unknown>;
  selectedIds?: string[];
}

/**
 * The single component every page mounts for exports. Opens the Export
 * Dialog — never downloads directly. See useExport.ts for the state this
 * wraps, and src/server/export/registry.ts to add a new `kind`.
 */
export function ExportButton({ kind, organizationId, label, filters = {}, selectedIds, children, ...buttonProps }: ExportButtonProps) {
  const state = useExport({ kind, organizationId, label, filters, selectedIds });

  return (
    <>
      <Button variant="secondary" icon={<ArrowDownTrayIcon className="h-4 w-4" />} {...buttonProps} onClick={state.openDialog}>
        {children ?? "Export"}
      </Button>
      <ExportDialog {...state} />
    </>
  );
}
