"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  EllipsisVerticalIcon,
  MapPinIcon,
  HashtagIcon,
  UserIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  PlusIcon,
  PencilIcon,
  UserGroupIcon,
  HomeIcon,
  AcademicCapIcon,
  QrCodeIcon,
  PrinterIcon,
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

export function formatRelativeTime(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return "Recently";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Recently";

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Updated just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `Updated ${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `Updated ${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return "Updated Yesterday";
  if (diffInDays < 7) return `Updated ${diffInDays} days ago`;

  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function shortenRegistrationNumber(regNum: string | null | undefined): string {
  if (!regNum) return "—";
  const parts = regNum.split("-");
  if (parts.length >= 2) {
    return `${parts.slice(-2).join("-")}`;
  }
  return regNum;
}

export function getStatusStyle(status: string) {
  switch (status?.toUpperCase()) {
    case "APPROVED":
      return {
        label: "• APPROVED",
        badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold",
      };
    case "PENDING":
      return {
        label: "• PENDING",
        badgeClass: "bg-amber-50 text-amber-700 border border-amber-200/80 font-bold",
      };
    case "CHECKED_IN":
    case "CHECKED IN":
      return {
        label: "• CHECKED IN",
        badgeClass: "bg-sky-50 text-sky-700 border border-sky-200/80 font-bold",
      };
    case "COMPLETED":
      return {
        label: "• COMPLETED",
        badgeClass: "bg-purple-50 text-purple-700 border border-purple-200/80 font-bold",
      };
    case "REJECTED":
      return {
        label: "• REJECTED",
        badgeClass: "bg-rose-50 text-rose-700 border border-rose-200/80 font-bold",
      };
    case "WAITLISTED":
      return {
        label: "• WAITLISTED",
        badgeClass: "bg-indigo-50 text-indigo-700 border border-indigo-200/80 font-bold",
      };
    case "REQUIRES_ACTION":
      return {
        label: "• ACTION REQ",
        badgeClass: "bg-amber-100 text-amber-900 border border-amber-300 font-bold",
      };
    default:
      return {
        label: `• ${status?.replace(/_/g, " ") || "DRAFT"}`,
        badgeClass: "bg-neutral-100 text-neutral-600 border border-neutral-200 font-bold",
      };
  }
}

interface MobileRegistrationCardProps {
  registration: any;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onClick: (reg: any) => void;
  onApprove?: (reg: any) => void;
  onReject?: (reg: any) => void;
  onQuickAction?: (reg: any, action: string) => void;
}

export function MobileRegistrationCard({
  registration,
  isSelected,
  onSelect,
  onClick,
  onApprove,
  onReject,
  onQuickAction,
}: MobileRegistrationCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const camperName = registration.camper?.name || registration.user?.name || registration.name || "Camper";
  const parentName = registration.parent?.name || registration.camper?.user?.name || registration.user?.email || "";
  const photoUrl = registration.camper?.photoUrl || registration.photoUrl;
  const statusInfo = getStatusStyle(registration.status);
  const campusName = registration.campus?.name || registration.campusName || "Campus Unassigned";
  const regNumber = shortenRegistrationNumber(registration.registrationNumber);
  const updatedTime = formatRelativeTime(registration.updatedAt || registration.createdAt);
  const relationship = registration.relationship || (registration.camper ? "Parent" : "Camper");

  // Dynamic Document Calculation
  const uploadedCount = Array.isArray(registration.documents) ? registration.documents.length : 0;
  const totalRequired = registration.camp?.documentRequirements?.length ?? registration.totalRequiredDocs ?? (registration.documents ? registration.documents.length : 2);
  const docPercent = totalRequired > 0 ? Math.min(100, Math.round((uploadedCount / totalRequired) * 100)) : 100;

  return (
    <div
      onClick={() => onClick(registration)}
      className={cn(
        "group relative flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 active:scale-[0.99] cursor-pointer max-w-full overflow-hidden",
        isSelected ? "border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/10" : "border-neutral-200/80 hover:border-neutral-300"
      )}
    >
      {/* SECTION 1 — IDENTITY & STATUS */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Checkbox */}
          <div
            className="shrink-0 pt-0.5"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onSelect(registration.id, e.target.checked);
              }}
              className="h-5 w-5 rounded border-neutral-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
              aria-label={`Select ${camperName}`}
            />
          </div>

          {/* Avatar */}
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-11 w-11 rounded-full object-cover shrink-0 border border-neutral-200"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100/80 text-purple-800 font-bold text-base shadow-2xs">
              {(camperName[0] || "C").toUpperCase()}
            </div>
          )}

          {/* Name & Relationship */}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[17px] font-bold text-neutral-900 leading-tight">
              {camperName}
            </h3>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                {relationship}
              </span>
              {parentName && (
                <span className="truncate text-xs font-medium text-neutral-500">
                  {parentName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wider", statusInfo.badgeClass)}>
            {statusInfo.label}
          </span>
        </div>
      </div>

      {/* SECTION 2 — QUICK INFORMATION (Concise Metadata) */}
      <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-[12px] font-medium text-neutral-600">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 min-w-0 text-neutral-700">
            <MapPinIcon className="h-3.5 w-3.5 text-purple-600 shrink-0" />
            <span className="truncate font-semibold">{campusName}</span>
          </div>
          <span className="font-mono text-xs text-neutral-400"># {regNumber}</span>
        </div>
        <span className="text-[11px] font-semibold text-neutral-400 shrink-0 ml-2">
          {updatedTime}
        </span>
      </div>

      {/* DYNAMIC DOCUMENT PROGRESS BAR */}
      <div className="mt-2.5 space-y-1">
        <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500">
          <span>
            Documents: {uploadedCount} of {totalRequired} uploaded
          </span>
          <span className="font-bold text-purple-600">
            {docPercent}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={cn(
              "h-full transition-all duration-300",
              docPercent === 100 ? "bg-emerald-500" : "bg-amber-500"
            )}
            style={{ width: `${docPercent}%` }}
          />
        </div>
      </div>

      {/* SECTION 3 — ACTIONS ROW */}
      <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onClick(registration)}
          className="flex-1 inline-flex min-h-[38px] items-center justify-center gap-1 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-xs transition-all active:scale-98"
        >
          <span>View Review</span>
          <span>→</span>
        </button>

        {/* Overflow Menu button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-neutral-50 border border-neutral-200/80 text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="More options"
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </button>

          {menuOpen && (
            <>
              {/* Click outside backdrop to close */}
              <div
                className="fixed inset-0 z-20 bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div
                className="absolute right-0 bottom-11 z-30 w-56 rounded-2xl border border-neutral-200 bg-white py-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onClick(registration);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-purple-50 hover:text-purple-900"
                >
                  <UserIcon className="h-4 w-4 text-neutral-500" />
                  View Registration
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onQuickAction?.(registration, "EDIT");
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-purple-50 hover:text-purple-900"
                >
                  <PencilIcon className="h-4 w-4 text-neutral-500" />
                  Edit Registration
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onQuickAction?.(registration, "TRIBE");
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-purple-50 hover:text-purple-900"
                >
                  <UserGroupIcon className="h-4 w-4 text-neutral-500" />
                  Assign Tribe
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onQuickAction?.(registration, "EMAIL");
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-purple-50 hover:text-purple-900"
                >
                  <EnvelopeIcon className="h-4 w-4 text-neutral-500" />
                  Send Email
                </button>
                <div className="my-1 border-t border-neutral-100" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onQuickAction?.(registration, "DELETE");
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  <TrashIcon className="h-4 w-4 text-rose-500" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface MobileRegistrationsViewProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenFilters: () => void;
  filterStatus: string;
  onSelectStatusFilter: (status: string) => void;
  stats: {
    totalCount: number;
    pendingCount: number;
    approvedCount: number;
    checkedInCount: number;
    rejectedCount: number;
  };
  registrations: any[];
  selectedIds: string[];
  onSelectRow: (id: string, checked: boolean) => void;
  onSelectAllOnPage?: (checked: boolean) => void;
  onCardClick: (reg: any) => void;
  onApprove?: (reg: any) => void;
  onReject?: (reg: any) => void;
  onQuickAction?: (reg: any, action: string) => void;
  onBulkApprove?: () => void;
  onBulkReject?: () => void;
  onBulkReassign?: () => void;
  onBulkDelete?: () => void;
  onClearSelection?: () => void;
  isLoading?: boolean;
  nextCursor?: string;
  onLoadMore?: () => void;
}

export function MobileRegistrationsView({
  searchQuery,
  onSearchChange,
  onOpenFilters,
  filterStatus,
  onSelectStatusFilter,
  stats,
  registrations,
  selectedIds,
  onSelectRow,
  onCardClick,
  onApprove,
  onReject,
  onQuickAction,
  onBulkApprove,
  onBulkReject,
  onBulkReassign,
  onBulkDelete,
  onClearSelection,
  isLoading,
  nextCursor,
  onLoadMore,
}: MobileRegistrationsViewProps) {
  const statCards = [
    { label: "All", value: stats.totalCount ?? registrations.length, statusKey: "", valueColor: "text-neutral-900" },
    { label: "Pending", value: stats.pendingCount ?? 0, statusKey: "PENDING", valueColor: "text-amber-600" },
    { label: "Approved", value: stats.approvedCount ?? 0, statusKey: "APPROVED", valueColor: "text-emerald-600" },
    { label: "Checked In", value: stats.checkedInCount ?? 0, statusKey: "CHECKED_IN", valueColor: "text-sky-600" },
    { label: "Rejected", value: stats.rejectedCount ?? 0, statusKey: "REJECTED", valueColor: "text-rose-600" },
  ];

  const filterChips = [
    { label: "All", key: "" },
    { label: "Pending", key: "PENDING", dotColor: "bg-amber-500" },
    { label: "Approved", key: "APPROVED", dotColor: "bg-emerald-500" },
    { label: "Checked In", key: "CHECKED_IN", dotColor: "bg-sky-500" },
    { label: "Completed", key: "COMPLETED", dotColor: "bg-purple-500" },
    { label: "Rejected", key: "REJECTED", dotColor: "bg-rose-500" },
    { label: "Waitlisted", key: "WAITLISTED", dotColor: "bg-indigo-500" },
    { label: "Requires Action", key: "REQUIRES_ACTION", dotColor: "bg-amber-600" },
  ];

  return (
    <div className="space-y-4 pb-24">
      {/* 1. SEARCH SECTION */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, email, phone, reg #..."
            className="w-full min-h-[46px] rounded-2xl border border-neutral-200/80 bg-neutral-100/80 pl-10 pr-4 text-sm font-medium text-neutral-900 placeholder:text-neutral-500 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
          />
        </div>

        <button
          type="button"
          onClick={onOpenFilters}
          className="inline-flex min-h-[46px] min-w-[46px] items-center justify-center rounded-2xl border border-neutral-200/80 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors shadow-2xs"
          aria-label="Filter"
        >
          <FunnelIcon className="h-5 w-5" />
        </button>
      </div>

      {/* 2. STATISTICS SUMMARY CARDS (Grid Layout) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-0.5">
        {statCards.map((stat) => {
          const isSelected = filterStatus === stat.statusKey;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => onSelectStatusFilter(stat.statusKey)}
              className={cn(
                "flex min-w-[100px] flex-col justify-between rounded-2xl border p-3.5 text-left transition-all shrink-0 active:scale-95 shadow-2xs",
                isSelected
                  ? "border-purple-600 bg-purple-50/60 ring-2 ring-purple-500/20"
                  : "border-neutral-200/80 bg-white hover:border-neutral-300"
              )}
            >
              <span className={cn("text-2xl font-extrabold tracking-tight", stat.valueColor)}>
                {stat.value}
              </span>
              <span className="mt-1 text-xs font-semibold text-neutral-600">
                {stat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. QUICK FILTER CHIPS (Horizontally Scrolling) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth">
        {filterChips.map((chip) => {
          const isSelected = filterStatus === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => onSelectStatusFilter(chip.key)}
              className={cn(
                "inline-flex items-center gap-1.5 shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all active:scale-95",
                isSelected
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-white border border-neutral-200/80 text-neutral-700 hover:bg-neutral-50"
              )}
            >
              {chip.dotColor && (
                <span className={cn("h-2 w-2 rounded-full", chip.dotColor)} />
              )}
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. REGISTRATION CARDS LIST */}
      {registrations.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-8 text-center">
          <p className="text-sm font-bold text-neutral-900">No registrations found</p>
          <p className="mt-1 text-xs text-neutral-500">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map((reg) => (
            <MobileRegistrationCard
              key={reg.id}
              registration={reg}
              isSelected={selectedIds.includes(reg.id)}
              onSelect={onSelectRow}
              onClick={onCardClick}
              onApprove={onApprove}
              onReject={onReject}
              onQuickAction={onQuickAction}
            />
          ))}
        </div>
      )}

      {/* LOAD MORE BUTTON */}
      {nextCursor && onLoadMore && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="w-full rounded-2xl border border-neutral-200/80 bg-white py-3 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 transition-colors"
          >
            {isLoading ? "Loading..." : "Load More Registrations"}
          </button>
        </div>
      )}

      {/* 5. STICKY BULK ACTION BAR (Slides up when 1+ selected) */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-4 bottom-6 z-40 flex items-center justify-between gap-2 rounded-2xl border border-purple-200 bg-neutral-900 p-3.5 text-white shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2 pl-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600 text-xs font-bold">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-neutral-200">Selected</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {onBulkApprove && (
              <button
                type="button"
                onClick={onBulkApprove}
                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition-colors"
              >
                Approve
              </button>
            )}
            {onBulkReject && (
              <button
                type="button"
                onClick={onBulkReject}
                className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 transition-colors"
              >
                Reject
              </button>
            )}
            {onBulkReassign && (
              <button
                type="button"
                onClick={onBulkReassign}
                className="rounded-xl bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                Reassign
              </button>
            )}
            {onBulkDelete && (
              <button
                type="button"
                onClick={onBulkDelete}
                className="rounded-xl bg-rose-950 text-rose-300 px-3 py-1.5 text-xs font-bold hover:bg-rose-900 transition-colors"
              >
                Delete
              </button>
            )}
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="rounded-xl px-2 py-1.5 text-xs font-semibold text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
