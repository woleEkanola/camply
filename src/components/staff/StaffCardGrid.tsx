"use client";

import { StaffCard } from "./StaffCard";

interface StaffCardGridProps {
  items: any[];
  type: "TEACHER" | "VOLUNTEER";
  onRowClick: (row: any) => void;
  actions?: (row: any) => React.ReactNode;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function StaffCardGrid({
  items,
  type,
  onRowClick,
  actions,
  selectedIds = [],
  onSelectionChange,
  isLoading,
  emptyTitle = `No ${type === "TEACHER" ? "teachers" : "volunteers"} found`,
  emptyDescription = "Try adjusting your filters.",
}: StaffCardGridProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-surface-raised" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-default bg-surface p-10 text-center">
        <h3 className="text-sm font-semibold text-neutral-900">{emptyTitle}</h3>
        <p className="mt-1 text-xs text-neutral-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((row) => (
        <StaffCard
          key={row.id}
          row={row}
          type={type}
          onClick={() => onRowClick(row)}
          actions={actions?.(row)}
          selected={selectedIds.includes(row.id)}
          onSelect={
            onSelectionChange
              ? (checked) => {
                  const next = checked ? [...selectedIds, row.id] : selectedIds.filter((id) => id !== row.id);
                  onSelectionChange(next);
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
