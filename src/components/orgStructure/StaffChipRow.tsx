"use client";

import { PhoneIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import type { StaffChip } from "@/server/api/routers/_shared/staffChip";

export interface StaffChipRowProps {
  chip: StaffChip;
  /** Defaults to the chip's current position title, else its type (Teacher/Volunteer). */
  subtitle?: string;
  onSiteBadge?: boolean;
  highlighted?: boolean;
  onClick: (chip: StaffChip) => void;
  /** Trailing one-tap Call button. Default on — turn off in contexts where
   * a full row tap already goes straight to the profile sheet's own Call
   * action and a second one would be redundant. */
  showQuickCall?: boolean;
}

/**
 * One tappable person row. Deliberately a `div[role=button]`, not a real
 * `<button>` — it contains a nested interactive `<a>` (quick Call), and a
 * real `<button>` cannot legally nest another interactive element. Mirrors
 * Table.tsx's mobile card row convention (role=button + tabIndex + onKeyDown
 * Enter/Space, stopPropagation on the nested action).
 */
export function StaffChipRow({ chip, subtitle, onSiteBadge, highlighted, onClick, showQuickCall = true }: StaffChipRowProps) {
  const subtitleText = subtitle ?? chip.positionTitle ?? (chip.type === "TEACHER" ? "Teacher" : "Volunteer");
  const hasPhone = !!chip.phone && chip.phone.trim().length > 0;
  const ariaLabel = `${chip.displayName}, ${subtitleText}${chip.campusName ? `, ${chip.campusName}` : ""}${onSiteBadge ? ", on site" : ""}`;

  return (
    <div
      id={`cs-staff-${chip.id}`}
      data-testid={`staff-chip-${chip.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onClick(chip)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(chip);
        }
      }}
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-[56px] w-full scroll-mt-28 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-shadow duration-500",
        "hover:bg-surface-raised active:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
        highlighted && "bg-brand-tint ring-2 ring-accent-500 ring-offset-1"
      )}
    >
      <Avatar name={chip.displayName} photoUrl={chip.photoUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-txt-primary">{chip.displayName}</span>
          {onSiteBadge && (
            <span
              className="shrink-0 rounded-full bg-[var(--status-success-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--status-success-fg)]"
              aria-hidden="true"
            >
              On site
            </span>
          )}
        </div>
        <div className="truncate text-xs text-txt-secondary">
          {subtitleText}
          {chip.campusName ? ` · ${chip.campusName}` : ""}
        </div>
      </div>
      {showQuickCall && hasPhone && (
        <a
          href={`tel:${chip.phone}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Call ${chip.displayName}`}
          data-testid={`staff-quick-call-${chip.id}`}
          className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent-600 hover:bg-accent-50"
        >
          <PhoneIcon className="h-5 w-5" />
        </a>
      )}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-txt-muted" aria-hidden="true" />
    </div>
  );
}
