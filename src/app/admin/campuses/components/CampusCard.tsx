"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { SignupLink } from "@/types/signupLink";
import {
  EllipsisVerticalIcon,
  UserGroupIcon,
  MapPinIcon,
  LinkIcon,
  ChartBarIcon,
  PencilIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  ClockIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
  AdjustmentsHorizontalIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";

export interface CampusRepInfo {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface CampusCardData {
  id: string;
  name: string;
  address: string;
  city: string;
  state?: string | null;
  zipCode?: string | null;
  country: string;
  organizationId: string;
  campusCode?: string | null;
  displayOrder: number;
  pastor?: string | null;
  phone?: string | null;
  email?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  reps?: CampusRepInfo[];
}

export interface CampusCardProps {
  campus: CampusCardData;
  signupLink?: SignupLink;
  activeCamp?: { id: string; name: string } | null;
  isSelected?: boolean;
  canSelect?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canManageReps?: boolean;
  canManageQuota?: boolean;
  canGenerateSignupLink?: boolean;
  copiedLinkId?: string | null;
  isGeneratingLink?: boolean;
  onSelect?: (id: string) => void;
  onOpenDetails?: (id: string) => void;
  onOpenEdit?: (id: string) => void;
  onOpenDelete?: (id: string) => void;
  onOpenManageReps?: (id: string) => void;
  onOpenQuotaModal?: (signupLink: SignupLink) => void;
  onOpenClickLog?: (signupLinkId: string, campusName: string) => void;
  onOpenAnalytics?: (id: string) => void;
  onGenerateSignupLink?: (id: string) => void;
  onCopySignupLink?: (id: string) => void;
  onDuplicateCampus?: (campus: CampusCardData) => void;
}

function getInitials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return "?";
  const clean = nameOrEmail.trim();
  if (clean.includes("@")) {
    return clean.slice(0, 2).toUpperCase();
  }
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function getCampusStatusInfo(signupLink?: SignupLink) {
  if (!signupLink || !signupLink.active) {
    return { status: "Inactive", tone: "neutral" as const, label: "• Inactive" };
  }
  if (signupLink.quota > 0 && signupLink.usedCount >= signupLink.quota) {
    return { status: "Full", tone: "warning" as const, label: "• Full" };
  }
  if (signupLink.quotaFullBehavior === "CLOSE" && signupLink.quota > 0 && signupLink.usedCount >= signupLink.quota) {
    return { status: "Closed", tone: "danger" as const, label: "• Closed" };
  }
  return { status: "Active", tone: "success" as const, label: "• Active" };
}

export const CampusCard: React.FC<CampusCardProps> = ({
  campus,
  signupLink,
  activeCamp,
  isSelected = false,
  canSelect = false,
  canUpdate = true,
  canDelete = true,
  canManageReps = true,
  canManageQuota = true,
  canGenerateSignupLink = true,
  copiedLinkId,
  isGeneratingLink = false,
  onSelect,
  onOpenDetails,
  onOpenEdit,
  onOpenDelete,
  onOpenManageReps,
  onOpenQuotaModal,
  onOpenClickLog,
  onOpenAnalytics,
  onGenerateSignupLink,
  onCopySignupLink,
  onDuplicateCampus,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddressExpanded, setIsAddressExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const statusInfo = getCampusStatusInfo(signupLink);
  const formattedAddress = [campus.address, campus.city].filter(Boolean).join(", ");
  const isCopied = copiedLinkId === campus.id;

  const quotaLimit = signupLink?.quota ?? 0;
  const usedCount = signupLink?.usedCount ?? 0;
  const isUnlimited = quotaLimit <= 0;
  const percent = isUnlimited ? 0 : Math.min(100, Math.round((usedCount / quotaLimit) * 100));

  return (
    <div
      data-testid="campus-card"
      onClick={() => onOpenDetails?.(campus.id)}
      className={cn(
        "group relative flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm transition-all duration-200 hover:border-neutral-300 hover:shadow-md cursor-pointer",
        isSelected ? "border-accent-500 ring-2 ring-accent-500/20 bg-accent-50/10" : "border-neutral-200/80"
      )}
    >
      {/* SECTION 1 — CAMPUS IDENTITY */}
      <div className="border-b border-neutral-100 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {canSelect && (
              <div
                className="pt-1 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(campus.id);
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onSelect?.(campus.id)}
                  className="h-5 w-5 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                  aria-label={`Select ${campus.name}`}
                />
              </div>
            )}

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-100/70 text-accent-700 shadow-2xs group-hover:bg-accent-100 transition-colors">
              <BuildingOffice2Icon className="h-6 w-6" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="truncate text-[18px] font-bold tracking-tight text-neutral-900 leading-snug">
                  {campus.name}
                </h3>
              </div>

              <p className="mt-0.5 truncate text-[13px] font-medium text-neutral-500">
                {campus.campusCode ? `${campus.campusCode}` : "No Code"}
                <span className="mx-1.5 text-neutral-300">•</span>
                Order #{campus.displayOrder ?? 0}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0" ref={menuRef}>
            <Badge tone={statusInfo.tone} className="shrink-0 text-xs px-2.5 py-1 font-semibold rounded-full">
              {statusInfo.label}
            </Badge>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen((prev) => !prev);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
              aria-label="Campus options menu"
            >
              <EllipsisVerticalIcon className="h-5 w-5" />
            </button>

            {isMenuOpen && (
              <div
                className="absolute right-0 top-12 z-30 w-56 rounded-2xl border border-neutral-200 bg-white py-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenEdit?.(campus.id);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-accent-50 hover:text-accent-900"
                  >
                    <PencilIcon className="h-4 w-4 text-neutral-500" />
                    Edit Campus
                  </button>
                )}

                {canManageReps && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenManageReps?.(campus.id);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-accent-50 hover:text-accent-900"
                  >
                    <UserGroupIcon className="h-4 w-4 text-neutral-500" />
                    Manage Representatives
                  </button>
                )}

                {signupLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onCopySignupLink?.(campus.id);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-accent-50 hover:text-accent-900"
                  >
                    <ClipboardDocumentIcon className="h-4 w-4 text-neutral-500" />
                    Copy Registration Link
                  </button>
                )}

                {signupLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenClickLog?.(signupLink.id, campus.name);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-accent-50 hover:text-accent-900"
                  >
                    <ClockIcon className="h-4 w-4 text-neutral-500" />
                    View Signup History
                  </button>
                )}

                {canManageQuota && signupLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenQuotaModal?.(signupLink);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-accent-50 hover:text-accent-900"
                  >
                    <AdjustmentsHorizontalIcon className="h-4 w-4 text-neutral-500" />
                    Set Registration Capacity
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onDuplicateCampus?.(campus);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 hover:bg-accent-50 hover:text-accent-900"
                >
                  <DocumentDuplicateIcon className="h-4 w-4 text-neutral-500" />
                  Duplicate Campus
                </button>

                {canDelete && (
                  <>
                    <div className="my-1 border-t border-neutral-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenDelete?.(campus.id);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium text-danger-600 hover:bg-danger-50"
                    >
                      <TrashIcon className="h-4 w-4 text-danger-500" />
                      Delete Campus
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2 — QUICK INFORMATION ROWS */}
      <div className="py-3.5 border-b border-neutral-100 space-y-3">
        {/* Representatives Row */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onOpenManageReps?.(campus.id);
          }}
          className="flex items-center justify-between gap-2 rounded-xl p-1 -mx-1 hover:bg-neutral-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-50 text-accent-600 shrink-0">
              <UserGroupIcon className="h-4 w-4" />
            </div>
            <span className="text-[13px] font-semibold text-neutral-800 truncate">
              {campus.reps && campus.reps.length > 0 ? `${campus.reps.length} Representatives` : "No Reps Assigned"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {campus.reps && campus.reps.length > 0 && (
              <div className="flex -space-x-2 overflow-hidden">
                {campus.reps.slice(0, 3).map((rep, idx) => {
                  const repName = [rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email || "";
                  return (
                    <div
                      key={rep.id || idx}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-200 font-semibold text-accent-900 text-[11px] ring-2 ring-white"
                      title={repName}
                    >
                      {getInitials(repName)}
                    </div>
                  );
                })}
              </div>
            )}
            <ChevronRightIcon className="h-4 w-4 text-neutral-400" />
          </div>
        </div>

        {/* Address Row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-50 text-accent-600 shrink-0">
                <MapPinIcon className="h-4 w-4" />
              </div>
              <span className="text-[13px] font-semibold text-neutral-800 truncate">Address</span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsAddressExpanded((prev) => !prev);
              }}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-neutral-500 hover:text-accent-700 transition-colors"
            >
              <span>{isAddressExpanded ? "Hide address" : "View address"}</span>
              <ChevronDownIcon className={cn(
                "h-3.5 w-3.5 text-neutral-400 transition-transform",
                isAddressExpanded && "rotate-180"
              )} />
            </button>
          </div>

          {isAddressExpanded && (
            <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-3.5 py-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
              <p className="text-xs text-neutral-700 leading-relaxed">
                {formattedAddress}
                {campus.state && `, ${campus.state}`}
                {campus.zipCode && ` ${campus.zipCode}`}
                {campus.country && `, ${campus.country}`}
              </p>
            </div>
          )}
        </div>

        {/* Signup Link Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-50 text-accent-600 shrink-0">
              <LinkIcon className="h-4 w-4" />
            </div>
            <span className="text-[13px] font-semibold text-neutral-800 truncate">Signup Link</span>
          </div>

          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] font-semibold text-emerald-600">
              {signupLink ? (signupLink.active ? "• Active" : "• Inactive") : "• Not Created"}
            </span>

            {signupLink ? (
              <button
                type="button"
                onClick={() => onCopySignupLink?.(campus.id)}
                className={cn(
                  "inline-flex min-h-[34px] items-center gap-1 rounded-xl px-3 py-1 text-xs font-semibold transition-all",
                  isCopied
                    ? "bg-emerald-600 text-white"
                    : "bg-accent-50 text-accent-700 hover:bg-accent-100 active:scale-95"
                )}
              >
                {isCopied ? (
                  <>
                    <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  "Copy"
                )}
              </button>
            ) : canGenerateSignupLink ? (
              <button
                type="button"
                onClick={() => onGenerateSignupLink?.(campus.id)}
                disabled={isGeneratingLink}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-accent-600 px-3 py-1 text-xs font-semibold text-white hover:bg-accent-700 transition-all disabled:opacity-50"
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                {isGeneratingLink ? "Generating..." : "Generate"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* SECTION 3 — REGISTRATION CAPACITY */}
      <div className="py-3.5 border-b border-neutral-100 space-y-2.5">
        <p className="text-[14px] font-bold text-neutral-900">Registrations</p>

        <div className="flex items-center justify-between">
          <span className="text-xl font-extrabold text-neutral-900 tracking-tight">
            {usedCount} <span className="text-neutral-400 font-normal text-base">/ {isUnlimited ? "∞" : quotaLimit}</span>
          </span>

          <div className="flex items-center gap-2">
            {canManageQuota && signupLink && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenQuotaModal?.(signupLink);
                }}
                className="text-xs font-semibold text-accent-600 hover:text-accent-800 transition-colors"
              >
                Set Capacity
              </button>
            )}
            {!isUnlimited && (
              <span className="text-base font-bold text-emerald-600">
                {percent}%
              </span>
            )}
          </div>
        </div>

        {/* Green Capacity Bar */}
        <div className="space-y-2">
          {isUnlimited ? (
            <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
              <div className="h-full bg-accent-400/40 w-full animate-pulse" />
            </div>
          ) : (
            <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}

          {/* Registration Analytics Action Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAnalytics?.(campus.id);
            }}
            className="w-full flex items-center justify-between rounded-xl bg-neutral-50/80 border border-neutral-100 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <ChartBarIcon className="h-4 w-4 text-neutral-500" />
              <span>View registration analytics</span>
            </div>
            <ChevronRightIcon className="h-4 w-4 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* SECTION 4 — ACTIONS */}
      <div className="pt-4 flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
        {canUpdate && (
          <button
            type="button"
            onClick={() => onOpenEdit?.(campus.id)}
            className="flex-1 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl bg-accent-50/90 text-accent-700 hover:bg-accent-100 font-semibold text-xs transition-all active:scale-98"
          >
            <PencilIcon className="h-3.5 w-3.5 text-accent-600" />
            Edit
          </button>
        )}

        {canManageReps && (
          <button
            type="button"
            onClick={() => onOpenManageReps?.(campus.id)}
            className="flex-1 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl bg-accent-50/90 text-accent-700 hover:bg-accent-100 font-semibold text-xs transition-all active:scale-98"
          >
            <UserGroupIcon className="h-3.5 w-3.5 text-accent-600" />
            Manage Reps
          </button>
        )}

        <button
          type="button"
          onClick={() => onOpenEdit?.(campus.id)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl bg-neutral-50 border border-neutral-100 text-neutral-500 hover:bg-neutral-100 transition-all"
          aria-label="Campus details option"
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default CampusCard;
