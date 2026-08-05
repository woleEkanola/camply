"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/trpc";
import { useToast } from "@/components/ui/Toast";
import type { ExportFormat, ExportKind, ExportScope } from "@/server/export/types";

export interface UseExportOptions {
  kind: ExportKind;
  organizationId: string;
  label: string;
  /** The page's current filters — shown read-only as "Current Filter" chips and used as the CURRENT_FILTER scope's filter set. */
  filters: Record<string, unknown>;
  selectedIds?: string[];
}

/**
 * Owns Export Dialog state for one page. Mount via <ExportButton /> rather
 * than calling this directly — see that component for the usual entry point.
 */
export function useExport({ kind, organizationId, label, filters, selectedIds }: UseExportOptions) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>("CURRENT_FILTER");
  const [presetId, setPresetId] = useState<string | undefined>(undefined);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, unknown>>({});
  const [format, setFormat] = useState<ExportFormat | undefined>(undefined);

  const describeQuery = api.export.describe.useQuery({ kind }, { enabled: open });

  useEffect(() => {
    if (describeQuery.data && !format) {
      setFormat(describeQuery.data.formats[0]);
    }
  }, [describeQuery.data, format]);

  const effectiveFilters = useMemo(() => {
    if (scope === "SELECTED") return {};
    const preset = describeQuery.data?.presets.find((p) => p.id === presetId);
    return { ...filters, ...(preset?.filters ?? {}), ...advancedFilters };
  }, [scope, filters, advancedFilters, presetId, describeQuery.data]);

  const enqueueParams = useMemo(
    () => ({
      organizationId,
      kind,
      format: format ?? "CSV",
      scope,
      presetId,
      filters: effectiveFilters,
      selectedIds: scope === "SELECTED" ? selectedIds ?? [] : undefined,
    }),
    [organizationId, kind, format, scope, presetId, effectiveFilters, selectedIds]
  );

  const estimateQuery = api.export.estimate.useQuery(enqueueParams, {
    enabled: open && !!format,
    staleTime: 0,
  });

  const createMutation = api.export.create.useMutation({
    onSuccess: () => {
      toast.success(`"${label}" export started — check the Export Center for progress.`);
      setOpen(false);
    },
    onError: (err) => {
      toast.error(err.message || "Couldn't start this export.");
    },
  });

  function openDialog() {
    setScope(selectedIds && selectedIds.length > 0 ? "SELECTED" : "CURRENT_FILTER");
    setPresetId(undefined);
    setAdvancedFilters({});
    setFormat(undefined);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
  }

  function selectPreset(id: string | undefined) {
    setPresetId(id);
    setAdvancedFilters({});
    if (id) setScope("CURRENT_FILTER");
  }

  function submit() {
    if (!format) return;
    createMutation.mutate({ ...enqueueParams, format, label });
  }

  return {
    open,
    openDialog,
    closeDialog,
    scope,
    setScope,
    presetId,
    selectPreset,
    advancedFilters,
    setAdvancedFilters,
    format,
    setFormat,
    describe: describeQuery.data,
    isDescribing: describeQuery.isLoading,
    estimate: estimateQuery.data,
    isEstimating: estimateQuery.isFetching,
    submit,
    isSubmitting: createMutation.isPending,
    hasSelection: (selectedIds?.length ?? 0) > 0,
    selectedCount: selectedIds?.length ?? 0,
    currentFilters: filters,
  };
}

export type UseExportReturn = ReturnType<typeof useExport>;
