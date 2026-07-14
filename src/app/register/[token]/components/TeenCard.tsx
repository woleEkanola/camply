"use client";

import { cn } from "@/lib/cn";
import type { TeenRegistration } from "../types";

interface TeenCardProps {
  teen: TeenRegistration;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
}

export function TeenCard({ teen, isActive, onClick, onRemove }: TeenCardProps) {
  const age = teen.dateOfBirth
    ? Math.floor((Date.now() - new Date(teen.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const complete = teen.fieldsComplete && teen.documentsComplete;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className={cn(
        "flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm transition-colors cursor-pointer",
        isActive ? "border-accent-500 ring-1 ring-accent-500" : "border-neutral-200 hover:border-neutral-300"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-700">
          {teen.firstName[0]}{teen.lastName[0]}
        </div>
        <div>
          <p className="font-medium text-neutral-900">{teen.firstName} {teen.lastName}</p>
          <p className="text-xs text-neutral-500">
            {age != null ? `Age ${age}` : "No DOB"}
            {teen.gender ? ` · ${teen.gender}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            complete ? "bg-success-100 text-success-700" : "bg-neutral-100 text-neutral-600"
          )}
        >
          {complete ? "Complete" : "Incomplete"}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
