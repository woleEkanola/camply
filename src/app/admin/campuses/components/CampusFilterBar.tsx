"use client";

import React, { useState, useRef, useEffect } from "react";
import { SearchBar } from "@/components/ui/SearchBar";
import { FunnelIcon, PlusIcon, ChevronDownIcon, Squares2X2Icon, TableCellsIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export type StatusFilterOption = "ALL" | "ACTIVE" | "INACTIVE" | "FULL" | "CLOSED";
export type SortOption = "order_asc" | "name_asc" | "name_desc" | "code_asc" | "quota_desc";

export interface CampusFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: StatusFilterOption;
  onStatusFilterChange: (status: StatusFilterOption) => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
  totalCount: number;
  filteredCount: number;
  viewMode?: "grid" | "table";
  onViewModeChange?: (mode: "grid" | "table") => void;
  onOpenCreateModal?: () => void;
  visibleColumns?: string[];
  onToggleColumn?: (key: string) => void;
  onResetColumns?: () => void;
}

export const CampusFilterBar: React.FC<CampusFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  totalCount,
  filteredCount,
  viewMode = "grid",
  onViewModeChange,
  onOpenCreateModal,
  visibleColumns,
  onToggleColumn,
  onResetColumns,
}) => {
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setIsFilterMenuOpen(false);
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortMenuOpen(false);
      }
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setIsColumnsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getSortLabel = (sort: SortOption) => {
    switch (sort) {
      case "order_asc":
        return "Order";
      case "name_asc":
        return "Name (A–Z)";
      case "name_desc":
        return "Name (Z–A)";
      case "code_asc":
        return "Code";
      case "quota_desc":
        return "Registrations";
      default:
        return "Order";
    }
  };

  return (
    <div className="space-y-3">
      {/* TOP CONTROLS ROW */}
      <div className="flex items-center gap-2">
        {/* Search Bar Input */}
        <div className="min-w-0 flex-1">
          <SearchBar
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onClear={() => onSearchChange("")}
            placeholder="Search campuses..."
            className="border-0 bg-neutral-100/80 focus:bg-white rounded-2xl py-2.5"
          />
        </div>

        {/* Filter Popup Button */}
        <div className="relative shrink-0" ref={filterRef}>
          <button
            type="button"
            onClick={() => setIsFilterMenuOpen((prev) => !prev)}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-neutral-200/80 bg-white text-neutral-600 hover:bg-neutral-50 transition-colors ${
              statusFilter !== "ALL" ? "border-accent-500 text-accent-600 bg-accent-50/50" : ""
            }`}
            title="Filter campuses"
          >
            <FunnelIcon className="h-5 w-5" />
          </button>

          {isFilterMenuOpen && (
            <div className="absolute right-0 z-30 mt-1.5 w-44 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Filter Status
              </div>
              {(["ALL", "ACTIVE", "INACTIVE", "FULL", "CLOSED"] as StatusFilterOption[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onStatusFilterChange(opt);
                    setIsFilterMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold ${
                    statusFilter === opt
                      ? "bg-accent-50 text-accent-700"
                      : "text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <span>{opt === "ALL" ? "All Statuses" : opt}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Columns Selector Button */}
        {visibleColumns && onToggleColumn && (
          <div className="relative shrink-0" ref={columnsRef}>
            <button
              type="button"
              onClick={() => setIsColumnsMenuOpen((prev) => !prev)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl border border-neutral-200/80 bg-white px-3.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <TableCellsIcon className="h-4 w-4 text-neutral-500" />
              <span>Columns</span>
              <span className="ml-1 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold text-accent-700">
                {visibleColumns.length}
              </span>
            </button>

            {isColumnsMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xl ring-1 ring-black/5 space-y-2">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                  <span className="text-xs font-bold text-neutral-900">Configure Columns</span>
                  {onResetColumns && (
                    <button
                      type="button"
                      className="text-[11px] font-bold text-accent-600 hover:underline"
                      onClick={() => {
                        onResetColumns();
                        setIsColumnsMenuOpen(false);
                      }}
                    >
                      Reset Defaults
                    </button>
                  )}
                </div>

                <div className="space-y-1 max-h-60 overflow-y-auto text-xs">
                  {[
                    { key: "select", label: "Checkbox Selection" },
                    { key: "campus", label: "Campus Name & Location" },
                    { key: "code", label: "Campus Code" },
                    { key: "reps", label: "Representatives" },
                    { key: "quota", label: "Capacity & Quota Progress" },
                    { key: "link", label: "Signup Link & Actions" },
                    { key: "order", label: "Display Order #" },
                    { key: "address", label: "Full Address" },
                    { key: "actions", label: "Action Menu" },
                  ].map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-50 cursor-pointer text-neutral-700 font-medium"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(col.key)}
                        onChange={() => onToggleColumn(col.key)}
                        className="h-3.5 w-3.5 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Mode Toggle */}
        {onViewModeChange && (
          <div className="flex shrink-0 rounded-2xl border border-neutral-200/80 bg-neutral-50 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={cn(
                "inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl transition-colors",
                viewMode === "grid"
                  ? "bg-white text-accent-600 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-600"
              )}
              title="Card view"
            >
              <Squares2X2Icon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("table")}
              className={cn(
                "inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl transition-colors",
                viewMode === "table"
                  ? "bg-white text-accent-600 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-600"
              )}
              title="Table view"
            >
              <TableCellsIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Add Campus (+) Button */}
        {onOpenCreateModal && (
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl bg-accent-600 text-white shadow-md hover:bg-accent-700 active:scale-95 transition-all"
            title="Add Campus"
          >
            <PlusIcon className="h-6 w-6 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* SUB-HEADER ROW (Count on Left, Sort on Right) */}
      <div className="flex items-center justify-between px-1 text-xs font-medium text-neutral-500">
        <div>
          {filteredCount === totalCount ? (
            <span>{totalCount} campuses</span>
          ) : (
            <span>{filteredCount} of {totalCount} campuses</span>
          )}
        </div>

        {/* Sort Dropdown Link */}
        <div className="relative" ref={sortRef}>
          <button
            type="button"
            onClick={() => setIsSortMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 font-semibold text-neutral-700 hover:text-accent-700 transition-colors"
          >
            <span>Sort: {getSortLabel(sortBy)}</span>
            <ChevronDownIcon className="h-3.5 w-3.5 text-neutral-400" />
          </button>

          {isSortMenuOpen && (
            <div className="absolute right-0 z-30 mt-1.5 w-48 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Sort Options
              </div>
              {[
                { id: "order_asc", label: "Display Order" },
                { id: "name_asc", label: "Name (A–Z)" },
                { id: "name_desc", label: "Name (Z–A)" },
                { id: "code_asc", label: "Campus Code" },
                { id: "quota_desc", label: "Registrations" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onSortByChange(opt.id as SortOption);
                    setIsSortMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold ${
                    sortBy === opt.id
                      ? "bg-accent-50 text-accent-700"
                      : "text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampusFilterBar;
