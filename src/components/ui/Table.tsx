"use client";

import { Fragment, useMemo, useState } from "react";
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
  /** Allow long content (e.g. addresses) to wrap within the column's width instead of
   * forcing the table wider and requiring horizontal scroll to see later columns. */
  wrap?: boolean;
  /** Renders a compact filter <select> under this column's header. Table stays
   * presentational — filter state and any resulting query params are owned by
   * the parent, same as the "controlled" mode's toolbar-driven filters. */
  filter?: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Mobile card layout: promotes this column to the card's title row.
   * Defaults to the first column when no column opts in. */
  primary?: boolean;
  /** Mobile card layout: renders as the subtitle beneath the title. */
  secondary?: boolean;
  /** Mobile card layout: omits this column from the card body (e.g. a raw
   * checkbox/icon column that's redundant with the built-in `selectable`
   * prop, or with the promoted primary/secondary column). */
  mobileHidden?: boolean;
  /** Label for this column's row in the mobile card body when `header`
   * isn't plain text. Falls back to `header`. */
  mobileLabel?: React.ReactNode;
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

/** `<option>` children must be plain text — falls back to "" for icon/JSX headers. */
function headerLabel(header: React.ReactNode): string {
  return typeof header === "string" || typeof header === "number" ? String(header) : "";
}

/**
 * Shared data table. `mode="local"` (default) reproduces the old DataTable's
 * client-side search/sort/pagination for small in-memory datasets.
 * `mode="controlled"` renders rows as given and hands the header area to a
 * `toolbar` — use this when the parent is driving a server-paginated/
 * server-searched source (e.g. a tRPC procedure with a `q`/cursor param).
 *
 * Below Tailwind's `md` breakpoint the same `columns`/`pageData` render as a
 * stacked card list instead of a `<table>` (dual-render, CSS-driven — no
 * JS/hydration flash, and no changes required to existing `Column<T>`
 * definitions). The first column is the card title unless a column opts in
 * via `primary`/`secondary`/`mobileHidden`.
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

  const primaryCol = columns.find((c) => c.primary) ?? columns[0];
  const secondaryCol = columns.find((c) => c.secondary);
  const bodyCols = columns.filter((c) => c !== primaryCol && c !== secondaryCol && !c.mobileHidden);
  const filterableCols = columns.filter((c) => c.filter);
  const sortableCols = columns.filter((c) => c.sortable && typeof c.accessor !== "function");

  const allOnPageSelected = pageData.length > 0 && pageData.every((row) => selectedIds?.includes(rowKey(row)));
  const toggleSelectAllOnPage = (checked: boolean) => {
    const pageIds = pageData.map((row) => rowKey(row));
    if (checked) {
      onSelectionChange?.(Array.from(new Set([...(selectedIds ?? []), ...pageIds])));
    } else {
      onSelectionChange?.((selectedIds ?? []).filter((id) => !pageIds.includes(id)));
    }
  };
  const toggleSelectRow = (row: T, checked: boolean) => {
    const id = rowKey(row);
    if (checked) {
      onSelectionChange?.([...(selectedIds ?? []), id]);
    } else {
      onSelectionChange?.((selectedIds ?? []).filter((existing) => existing !== id));
    }
  };

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
            onClear={() => {
              setSearchTerm("");
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
        <>
          {/* Desktop: unchanged table, gated to md+. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  {selectable && (
                    <th scope="col" className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        className="rounded border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        checked={allOnPageSelected}
                        onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
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
                {columns.some((c) => c.filter) && (
                  <tr className="border-t border-neutral-100 bg-neutral-50">
                    {selectable && <th scope="col" className="px-4 py-1.5" />}
                    {columns.map((column, i) => (
                      <th key={i} scope="col" className="px-4 py-1.5 font-normal">
                        {column.filter && (
                          <select
                            aria-label={typeof column.header === "string" ? `Filter by ${column.header}` : undefined}
                            className="w-full rounded border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-600 focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                            value={column.filter.value}
                            onChange={(e) => column.filter!.onChange(e.target.value)}
                          >
                            <option value="">{column.filter.placeholder ?? "All"}</option>
                            {column.filter.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      </th>
                    ))}
                    {actions && <th scope="col" className="px-4 py-1.5" />}
                  </tr>
                )}
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
                          onChange={(e) => toggleSelectRow(row, e.target.checked)}
                          aria-label="Select row"
                        />
                      </td>
                    )}
                    {columns.map((column, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-4 py-3 text-sm text-neutral-700",
                          column.wrap ? "whitespace-normal break-words" : "whitespace-nowrap",
                          column.className
                        )}
                      >
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

          {/* Mobile: card list built from the same columns/pageData/getCellValue. */}
          <div className="md:hidden">
            {(filterableCols.length > 0 || (!isControlled && sortableCols.length > 0) || selectable) && (
              <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-2">
                {selectable && (
                  <label className="flex min-h-[44px] items-center gap-2 pr-1 text-xs font-medium text-neutral-600">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      checked={allOnPageSelected}
                      onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                      aria-label="Select all rows on this page"
                    />
                    All
                  </label>
                )}
                {filterableCols.map((column, i) => (
                  <select
                    key={i}
                    aria-label={typeof column.header === "string" ? `Filter by ${column.header}` : undefined}
                    className="min-h-[40px] flex-1 rounded border border-neutral-200 bg-white px-2 text-sm text-neutral-600 focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                    value={column.filter!.value}
                    onChange={(e) => column.filter!.onChange(e.target.value)}
                  >
                    <option value="">{column.filter!.placeholder ?? "All"}</option>
                    {column.filter!.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ))}
                {!isControlled && sortableCols.length > 0 && (
                  <select
                    aria-label="Sort by"
                    className="min-h-[40px] flex-1 rounded border border-neutral-200 bg-white px-2 text-sm text-neutral-600 focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                    value={sortConfig.key ? `${String(sortConfig.key)}:${sortConfig.direction}` : ""}
                    onChange={(e) => {
                      const [key, direction] = e.target.value.split(":");
                      if (!key) {
                        setSortConfig({ key: null, direction: "asc" });
                        return;
                      }
                      setSortConfig({ key: key as keyof T, direction: direction as "asc" | "desc" });
                    }}
                  >
                    <option value="">Sort by…</option>
                    {sortableCols.map((column, i) => {
                      const label = headerLabel(column.header);
                      const key = String(column.accessor);
                      return (
                        <Fragment key={i}>
                          <option value={`${key}:asc`}>{label} (A–Z)</option>
                          <option value={`${key}:desc`}>{label} (Z–A)</option>
                        </Fragment>
                      );
                    })}
                  </select>
                )}
              </div>
            )}

            <ul className="divide-y divide-neutral-100">
              {pageData.map((row) => {
                const clickable = !!onRowClick;
                const isSelected = selectedIds?.includes(rowKey(row)) ?? false;
                return (
                  <li key={rowKey(row)}>
                    <div
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => onRowClick(row) : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onRowClick(row);
                              }
                            }
                          : undefined
                      }
                      className={cn("flex flex-col gap-3 p-4", clickable && "cursor-pointer active:bg-neutral-50")}
                    >
                      <div className="flex items-start gap-3">
                        {selectable && (
                          <label
                            className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="h-5 w-5 rounded border-neutral-300 text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                              checked={isSelected}
                              onChange={(e) => toggleSelectRow(row, e.target.checked)}
                              aria-label="Select row"
                            />
                          </label>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-neutral-900">{getCellValue(row, primaryCol)}</div>
                          {secondaryCol && (
                            <div className="mt-0.5 truncate text-xs text-neutral-500">{getCellValue(row, secondaryCol)}</div>
                          )}
                        </div>
                      </div>

                      {bodyCols.length > 0 && (
                        <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1.5 text-sm">
                          {bodyCols.map((column, i) => (
                            <Fragment key={i}>
                              <dt className="truncate text-neutral-500">{column.mobileLabel ?? column.header}</dt>
                              <dd className="min-w-0 text-neutral-800">{getCellValue(row, column)}</dd>
                            </Fragment>
                          ))}
                        </dl>
                      )}

                      {actions && (
                        <div className="flex flex-wrap justify-end gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                          {actions(row)}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
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
