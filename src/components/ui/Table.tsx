"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { SearchBar } from "./SearchBar";
import { EmptyState } from "./EmptyState";
import { SkeletonTable } from "./Skeleton";

export interface Column<T> {
  id?: string;
  header: React.ReactNode;
  accessor: keyof T | ((row: T) => React.ReactNode);
  sortable?: boolean;
  searchable?: boolean;
  className?: string;
  hideable?: boolean;
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

export interface ColumnVisibilityState {
  visibleIds: string[];
  onToggle: (id: string) => void;
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
  columnVisibility?: ColumnVisibilityState;
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
  const { columns, data, rowKey, onRowClick, actions, isLoading, emptyTitle, emptyDescription, emptyAction, selectable, selectedIds, onSelectionChange, columnVisibility } = props;
  const isControlled = props.mode === "controlled";

  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: "asc" | "desc" }>({
    key: null,
    direction: "asc",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);

  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [resizingColIndex, setResizingColIndex] = useState<number | null>(null);

  const handleMouseDownResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const thElement = (e.currentTarget.parentElement as HTMLElement);
    const startWidth = thElement ? thElement.getBoundingClientRect().width : 150;

    setResizingColIndex(index);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(70, Math.min(800, startWidth + deltaX));
      setColumnWidths((prev) => ({ ...prev, [index]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingColIndex(null);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const activeColumns = useMemo(() => {
    if (!columnVisibility) return columns;
    return columns.filter((col) => {
      if (!col.hideable) return true;
      const colId = col.id ?? headerLabel(col.header);
      return columnVisibility.visibleIds.includes(colId);
    });
  }, [columns, columnVisibility]);

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
        activeColumns.some((col) => {
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
  }, [data, searchTerm, sortConfig, activeColumns, isControlled]);

  const totalPages = Math.max(1, Math.ceil(processed.length / itemsPerPage));
  const pageData = isControlled ? processed : processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const primaryCol = activeColumns.find((c) => c.primary) ?? activeColumns[0];
  const secondaryCol = activeColumns.find((c) => c.secondary);
  const bodyCols = activeColumns.filter((c) => c !== primaryCol && c !== secondaryCol && !c.mobileHidden);
  const filterableCols = activeColumns.filter((c) => c.filter);
  const sortableCols = activeColumns.filter((c) => c.sortable && typeof c.accessor !== "function");

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

  const hideableColumns = useMemo(() => columns.filter((col) => col.hideable), [columns]);

  return (
    <div className="overflow-hidden rounded-lg border border-border-default bg-surface">
      <div className="flex flex-col gap-2 border-b border-border-default p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
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

        {columnVisibility && hideableColumns.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              id="column-visibility-menu-button"
              onClick={() => setIsColumnDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs font-medium text-txt-secondary shadow-xs hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              <svg className="h-4 w-4 text-txt-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Columns
            </button>

            {isColumnDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setIsColumnDropdownOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1.5 w-48 rounded-lg border border-elevated-border bg-elevated p-2 shadow-xl">
                  <div className="mb-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-txt-muted">
                    Visible Columns
                  </div>
                  <div className="space-y-1">
                    {hideableColumns.map((col) => {
                      const colId = col.id ?? headerLabel(col.header);
                      const isVisible = columnVisibility.visibleIds.includes(colId);
                      const labelText = headerLabel(col.header) || colId;
                      return (
                        <label
                          key={colId}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-txt-secondary hover:bg-surface-raised"
                        >
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => columnVisibility.onToggle(colId)}
                            className="rounded border-input-border text-accent-600 focus:ring-accent-500"
                          />
                          <span>{labelText}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="p-3">
          <SkeletonTable columns={activeColumns.length} />
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
            <table className="min-w-full divide-y divide-border-default">
              <thead className="bg-surface-raised">
                <tr>
                  {selectable && (
                    <th scope="col" className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-input-border text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                        checked={allOnPageSelected}
                        onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                        aria-label="Select all rows on this page"
                      />
                    </th>
                  )}
                  {activeColumns.map((column, i) => (
                    <th
                      key={i}
                      scope="col"
                      style={columnWidths[i] ? { width: `${columnWidths[i]}px`, minWidth: `${columnWidths[i]}px`, maxWidth: `${columnWidths[i]}px` } : undefined}
                      className={cn(
                        "relative px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-txt-secondary group select-none overflow-hidden",
                        column.sortable && "cursor-pointer hover:bg-surface-hover",
                        column.className
                      )}
                    >
                      <div className="flex items-center justify-between min-w-0 pr-1">
                        <div className="truncate min-w-0 flex-1">
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
                        </div>
                      </div>

                      {/* Column Drag-to-Resize Handle */}
                      <div
                        onMouseDown={(e) => handleMouseDownResize(i, e)}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-accent-400/50 transition-colors z-20 group-hover:bg-neutral-300/60",
                          resizingColIndex === i && "bg-accent-500"
                        )}
                        title="Drag to resize column width"
                      />
                    </th>
                  ))}
                  {actions && <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-txt-secondary">Actions</th>}
                </tr>
                {activeColumns.some((c) => c.filter) && (
                  <tr className="border-t border-border-default bg-surface-raised">
                    {selectable && <th scope="col" className="px-4 py-1.5" />}
                    {activeColumns.map((column, i) => (
                      <th key={i} scope="col" className="px-4 py-1.5 font-normal">
                        {column.filter && (
                          <select
                            aria-label={typeof column.header === "string" ? `Filter by ${column.header}` : undefined}
                            className="w-full rounded border border-input-border bg-input-bg px-1.5 py-1 text-xs text-txt-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
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
              <tbody className="divide-y divide-border-subtle bg-surface">
                {pageData.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-surface-hover")}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-input-border text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                          checked={selectedIds?.includes(rowKey(row)) ?? false}
                          onChange={(e) => toggleSelectRow(row, e.target.checked)}
                          aria-label="Select row"
                        />
                      </td>
                    )}
                    {activeColumns.map((column, i) => (
                      <td
                        key={i}
                        style={columnWidths[i] ? { width: `${columnWidths[i]}px`, minWidth: `${columnWidths[i]}px`, maxWidth: `${columnWidths[i]}px` } : undefined}
                      className={cn(
                        "px-4 py-3 text-sm text-txt-primary overflow-hidden",
                          column.wrap ? "whitespace-normal break-words" : "truncate",
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
              <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-raised px-3 py-2">
                {selectable && (
                  <label className="flex min-h-[44px] items-center gap-2 pr-1 text-xs font-medium text-txt-secondary">
                         <input
                           type="checkbox"
                           className="rounded border-input-border text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
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
                    className="min-h-[40px] flex-1 rounded border border-input-border bg-input-bg px-2 text-sm text-txt-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
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
                    className="min-h-[40px] flex-1 rounded border border-input-border bg-input-bg px-2 text-sm text-txt-primary focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
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

            <ul className="divide-y divide-border-subtle">
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
        <div className="flex items-center justify-between border-t border-border-default px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm text-txt-secondary">
            <span>
              {Math.min(processed.length, (currentPage - 1) * itemsPerPage + 1)}–
              {Math.min(processed.length, currentPage * itemsPerPage)} of {processed.length}
            </span>
            <select
              className="rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-sm text-txt-primary"
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
              className="rounded-md p-1.5 text-txt-secondary hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-txt-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm text-txt-secondary">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md p-1.5 text-txt-secondary hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-txt-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
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
