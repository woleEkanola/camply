"use client";

import { cn } from "@/lib/cn";
import { Squares2X2Icon, ListBulletIcon } from "@heroicons/react/24/outline";

export type StaffViewMode = "list" | "cards";

interface ViewModeToggleProps {
  value: StaffViewMode;
  onChange: (value: StaffViewMode) => void;
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-border-default bg-surface p-0.5 shadow-xs">
      <button
        type="button"
        onClick={() => onChange("list")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
          value === "list"
            ? "brand-tint-strong"
            : "text-txt-secondary hover:text-txt-primary hover:bg-surface-hover"
        )}
        aria-pressed={value === "list"}
      >
        <ListBulletIcon className="h-4 w-4" />
        List
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
          value === "cards"
            ? "brand-tint-strong"
            : "text-txt-secondary hover:text-txt-primary hover:bg-surface-hover"
        )}
        aria-pressed={value === "cards"}
      >
        <Squares2X2Icon className="h-4 w-4" />
        Cards
      </button>
    </div>
  );
}
