"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldChange {
  field: string;
  previousValue?: string | null;
  newValue?: string | null;
  changedAt?: string | null;
  changedById?: string | null;
}

interface ChangesSinceReviewProps {
  registration: {
    fieldChangeLog?: FieldChange[] | null;
  };
  /** Optional: ISO date string of the last completed review. Only changes after this date are shown. */
  lastReviewedAt?: string | null;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatValue(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  return value;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fieldLabel(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChangesSinceReview({
  registration,
  lastReviewedAt,
}: ChangesSinceReviewProps) {
  const [expanded, setExpanded] = useState(false);

  const rawChanges = (registration.fieldChangeLog as FieldChange[]) ?? [];

  // Filter by lastReviewedAt if provided
  const filteredChanges = lastReviewedAt
    ? rawChanges.filter((c) => {
        if (!c.changedAt) return true;
        return new Date(c.changedAt).getTime() > new Date(lastReviewedAt).getTime();
      })
    : rawChanges;

  const hasChanges = filteredChanges.length > 0;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50 transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <svg
            className={cn(
              "h-4 w-4 text-neutral-400 transition-transform",
              expanded && "rotate-90"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Changes Since Last Review
          {hasChanges && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
              {filteredChanges.length}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          {!hasChanges ? (
            <p className="text-sm text-neutral-400">No changes since last review.</p>
          ) : (
            <ul className="space-y-3">
              {filteredChanges.map((change, index) => (
                <li
                  key={index}
                  className="rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-neutral-800">
                      {fieldLabel(change.field)}
                    </span>
                    {change.changedAt && (
                      <span className="text-xs text-neutral-400">
                        {formatTimestamp(change.changedAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-400 line-through">
                      {formatValue(change.previousValue)}
                    </span>
                    <span className="text-neutral-300">→</span>
                    <span className="text-success-700 font-medium">
                      {formatValue(change.newValue)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
