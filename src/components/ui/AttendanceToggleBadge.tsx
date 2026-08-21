"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { CheckIcon, XMarkIcon } from "@heroicons/react/20/solid";

export interface AttendanceToggleBadgeProps {
  status?: string | null;
  onToggle?: (nextStatus: "COMING" | "NOT_COMING") => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  readOnly?: boolean;
  showTooltip?: boolean;
}

export function AttendanceToggleBadge({
  status,
  onToggle,
  disabled = false,
  size = "sm",
  className,
  readOnly = false,
}: AttendanceToggleBadgeProps) {
  const isComing = status !== "NOT_COMING";
  const nextStatus = isComing ? "NOT_COMING" : "COMING";

  const sizeClasses =
    size === "sm"
      ? "px-2 py-0.5 text-[11px] gap-1"
      : "px-3 py-1 text-xs gap-1.5";

  const content = (
    <span
      className={cn(
        "inline-flex items-center font-bold rounded-full border transition-all select-none",
        sizeClasses,
        isComing
          ? "bg-emerald-50 text-emerald-800 border-emerald-300/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/80 shadow-2xs"
          : "bg-rose-50 text-rose-800 border-rose-300/90 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700/90 shadow-2xs",
        !readOnly && !disabled && "cursor-pointer hover:scale-105 active:scale-95",
        disabled && "opacity-60 cursor-not-allowed",
        className
      )}
      title={
        readOnly
          ? isComing
            ? "Participant confirmed coming to camp"
            : "Participant marked as NOT coming to camp"
          : `Click to mark as ${isComing ? "Not Coming" : "Coming"}`
      }
    >
      {isComing ? (
        <>
          <CheckIcon className={size === "sm" ? "h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 stroke-2" : "h-4 w-4 text-emerald-600 dark:text-emerald-400 stroke-2"} />
          <span>Coming</span>
        </>
      ) : (
        <>
          <XMarkIcon className={size === "sm" ? "h-3.5 w-3.5 text-rose-600 dark:text-rose-400 stroke-2" : "h-4 w-4 text-rose-600 dark:text-rose-400 stroke-2"} />
          <span>Not Coming</span>
        </>
      )}
    </span>
  );

  if (readOnly || !onToggle) {
    return content;
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(nextStatus);
      }}
      className="inline-flex items-center focus:outline-none focus:ring-2 focus:ring-accent-500 rounded-full"
    >
      {content}
    </button>
  );
}
