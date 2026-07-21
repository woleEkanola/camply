"use client";

import { cn } from "@/lib/cn";
import { Squares2X2Icon, ListBulletIcon } from "@heroicons/react/24/outline";

export type StaffViewMode = "cards" | "list";

interface ViewModeToggleProps {
  value: StaffViewMode;
  onChange: (value: StaffViewMode) => void;
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 shadow-xs">
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
          value === "cards" ? "bg-accent-100 text-accent-700" : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
        )}
        aria-pressed={value === "cards"}
      >
        <Squares2X2Icon className="h-4 w-4" />
        Cards
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
          value === "list" ? "bg-accent-100 text-accent-700" : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
        )}
        aria-pressed={value === "list"}
      >
        <ListBulletIcon className="h-4 w-4" />
        List
      </button>
    </div>
  );
}
