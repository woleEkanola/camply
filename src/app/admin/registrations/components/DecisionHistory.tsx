"use client";

import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";

const STATUS_CHANGE_ACTIONS = [
  "REGISTRATION_ENDORSED",
  "REGISTRATION_APPROVED",
  "REGISTRATION_REJECTED",
  "WAITLISTED",
  "CORRECTION_REQUESTED",
  "CANCELLED",
  "ARCHIVED",
];

const STATUS_LABELS: Record<string, string> = {
  REGISTRATION_ENDORSED: "Recommended",
  REGISTRATION_APPROVED: "Approved",
  REGISTRATION_REJECTED: "Rejected",
  WAITLISTED: "Waitlisted",
  CORRECTION_REQUESTED: "Correction Requested",
  CANCELLED: "Cancelled",
  ARCHIVED: "Archived",
};

const STATUS_COLORS: Record<string, string> = {
  REGISTRATION_ENDORSED: "bg-info-100 text-info-700 border-info-300",
  REGISTRATION_APPROVED: "bg-success-100 text-success-700 border-success-300",
  REGISTRATION_REJECTED: "bg-danger-100 text-danger-700 border-danger-300",
  WAITLISTED: "bg-attention-100 text-attention-700 border-attention-300",
  CORRECTION_REQUESTED: "bg-warning-100 text-warning-700 border-warning-300",
  CANCELLED: "bg-neutral-100 text-neutral-600 border-neutral-300",
  ARCHIVED: "bg-neutral-100 text-neutral-500 border-neutral-300",
};

interface DecisionHistoryProps {
  timeline: any[];
}

export function DecisionHistory({ timeline }: DecisionHistoryProps) {
  const statusChanges = (timeline ?? []).filter((event: any) =>
    STATUS_CHANGE_ACTIONS.includes(event.action)
  );

  if (statusChanges.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
        <p className="text-sm text-neutral-500">No status changes recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-900">Decision History</h3>
      </div>
      <div className="px-4 py-4">
        <div className="relative">
          {statusChanges.map((event: any, index: number) => {
            const isLast = index === statusChanges.length - 1;
            const isOverride = event.action === "REGISTRATION_APPROVED" && event.newValue?.twoStepOverride === true;
            const label = isOverride
              ? "Approved (admin override — no recommendation)"
              : (STATUS_LABELS[event.action] ?? event.action.replace(/_/g, " "));
            const colorClass = STATUS_COLORS[event.action] ?? "bg-neutral-100 text-neutral-700 border-neutral-300";

            // Build a human-readable reason/message from event metadata
            let detail: string | null = null;
            if (event.metadata) {
              try {
                const meta = typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata;
                detail = meta.reason || meta.message || null;
              } catch {
                // ignore parse errors
              }
            }

            return (
              <div key={event.id} className="flex gap-3">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold",
                      colorClass,
                    )}
                  >
                    {index + 1}
                  </div>
                  {!isLast && (
                    <div className="mt-0.5 w-0.5 flex-1 bg-neutral-200" />
                  )}
                </div>

                {/* Content */}
                <div className={cn("pb-5", isLast && "pb-0")}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-neutral-900">
                      {label}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {event.createdAt
                        ? new Date(event.createdAt).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  {detail && (
                    <p className="mt-1 text-sm text-neutral-600">{detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
