"use client";

import { cn } from "@/lib/cn";
import type { TeenRegistration } from "../types";

interface TeenSwitcherProps {
  teens: TeenRegistration[];
  activeTeenId: string | null;
  onChange: (camperId: string) => void;
}

export function TeenSwitcher({ teens, activeTeenId, onChange }: TeenSwitcherProps) {
  if (teens.length <= 1) return null;

  return (
    <div className="mb-4 flex gap-1 rounded-xl bg-neutral-100 p-1" role="tablist" aria-label="Switch teen">
      {teens.map((teen) => (
        <button
          key={teen.camperId}
          role="tab"
          aria-selected={activeTeenId === teen.camperId}
          onClick={() => onChange(teen.camperId)}
          className={cn(
            "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            activeTeenId === teen.camperId
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          )}
        >
          <span className="flex items-center justify-center gap-1.5">
            {teen.firstName}
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                teen.fieldsComplete && teen.documentsComplete ? "bg-success-500" : teen.fieldsComplete ? "bg-warning-400" : "bg-neutral-300"
              )}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
