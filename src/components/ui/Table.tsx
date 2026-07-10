"use client";

import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { SearchBar } from "./SearchBar";
import { EmptyState } from "./EmptyState";
import { SkeletonTable } from "./Skeleton";

export interface Column<T> {
  header: React.ReactNode;
  accessor: keyof T | ((row: T) => React.ReactNode);
  sortable?: boolean;
  searchable?: boolean;
  className?: string;
}

interface CommonProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => React.ReactNode;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Adds a checkbox column for bulk actions. Selection state is owned by the parent. */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

interface LocalModeProps<T> extends CommonProps<T> {
  mode?: "local";
  searchPlaceholder?: string;
}

interface ControlledModeProps<T> extends CommonProps<T> {
  mode: "controlled";
  /** Rendered above the table — parent owns search/filter state and paging
   * (e.g. driving a server-side `q` param like registration.adminList). */
  toolbar?: React.ReactNode;
  /** Rendered below the table (e.g. cursor-based "Load more"). */
  footer?: React.ReactNode;
}

type TableProps<T> = LocalModeProps<T> | ControlledModeProps<T>;

function getCellValue<T>(row: T, column: Column<T>): React.ReactNode {
  return typeof column.accessor === "function" ? column.accessor(row) : (row[column.accessor] as React.ReactNode);
}

/**
 * Shared data table. `mode="local"` (default) reproduces the old DataTable's
 * client-side search/sort/pagination for small in-memory datasets.
 * `mode="controlled"` renders rows as given and hands the header area to a
 * `toolbar` — use this when the parent is driving a server-paginated/
 * server-searched source (e.g. a tRPC procedure with a `q`/cursor param).
 */
export function Table<T>(props: TableProps<T>) {
  const { columns, data, rowKey, onRowClick, actions, isLoading, emptyTitle, emptyDescription, emptyAction, selectable, selectedIds, onSelectionChange } = props;
  const isControlled = props.mode === "controlled";

  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: "asc" | "desc" }>({
    key: null,
    direction: "asc",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleSort = (key: keyof T) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );
  };

  const processed = useMemo(() => {
    if (isControlled) return data;
    let items = [...data];
    if (searchTerm) {
      items = items.filter((row) =>
        columns.some((col) => {
          if (!col.searchable || typeof col.accessor === "function") return false;
          const value = row[col.accessor];
          return typeof value === "string" || typeof value === "number"
            ? String(value).toLowerCase().includes(searchTerm.toLowerCase())
            : false;
        })
      );
    }
    if (sortConfig.key) {
      items.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof T];
        const bValue = b[sortConfig.key as keyof T];
        if (aValue === bValue) return 0;
        const cmp = aValue < bValue ? -1 : 1;
        return sortConfig.direction === "asc" ? cmp : -cmp;
      });
    }
    return items;
  }, [data, searchTerm, sortConfig, columns, isControlled]);

  const totalPages = Math.max(1, Math.ceil(processed.length / itemsPerPage));
  const pageData = isControlled ? processed : processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 p-3">
        {isControlled ? (
          props.toolbar
        ) : (
          <SearchBar
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={props.searchPlaceholder ?? "Search..."}
          />
        )}
      </div>

      {isLoading ? (
        <div className="p-3">
          <SkeletonTable columns={columns.length} />
        </div>
      ) : pageData.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? "Nothing here yet"}
          description={emptyDescription}
          action={emptyAction}
          className="border-0"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                {selectable && (
                  <th scope="col" className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="rounded border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      checked={pageData.length > 0 && pageData.every((row) => selectedIds?.includes(rowKey(row)))}
                      onChange={(e) => {
                        const pageIds = pageData.map((row) => rowKey(row));
                        if (e.target.checked) {
                          onSelectionChange?.(Array.from(new Set([...(selectedIds ?? []), ...pageIds])));
                        } else {
                          onSelectionChange?.((selectedIds ?? []).filter((id) => !pageIds.includes(id)));
                        }
                      }}
                      aria-label="Select all rows on this page"
                    />
                  </th>
                )}
                {columns.map((column, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={cn(
                      "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-neutral-500",
                      column.sortable && "cursor-pointer select-none hover:bg-neutral-100",
                      column.className
                    )}
                  >
                    {column.sortable && typeof column.accessor !== "function" ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        onClick={() => handleSort(column.accessor as keyof T)}
                      >
                        {column.header}
                        {sortConfig.key === column.accessor && <span>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
                {actions && <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-neutral-500">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {pageData.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer hover:bg-neutral-50")}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        checked={selectedIds?.includes(rowKey(row)) ?? false}
                        onChange={(e) => {
                          const id = rowKey(row);
                          if (e.target.checked) {
                            onSelectionChange?.([...(selectedIds ?? []), id]);
                          } else {
                            onSelectionChange?.((selectedIds ?? []).filter((existing) => existing !== id));
                          }
                        }}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  {columns.map((column, i) => (
                    <td key={i} className={cn("whitespace-nowrap px-4 py-3 text-sm text-neutral-700", column.className)}>
                      {getCellValue(row, column)}
                    </td>
                  ))}
                  {actions && (
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm" onClick={(e) => e.stopPropagation()}>
                      {actions(row)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isControlled && processed.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <span>
              {Math.min(processed.length, (currentPage - 1) * itemsPerPage + 1)}–
              {Math.min(processed.length, currentPage * itemsPerPage)} of {processed.length}
            </span>
            <select
              className="rounded border border-neutral-300 px-1.5 py-0.5 text-sm"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm text-neutral-500">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              aria-label="Next page"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isControlled && props.footer}
    </div>
  );
}
