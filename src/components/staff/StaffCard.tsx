"use client";

import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";

interface StaffCardProps {
  row: any;
  onClick?: () => void;
  actions?: React.ReactNode;
  type: "TEACHER" | "VOLUNTEER";
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
}

export function StaffCard({ row, onClick, actions, type, selected, onSelect }: StaffCardProps) {
  const name = `${row.firstName} ${row.lastName}`.trim();
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-xs transition",
        onClick && "cursor-pointer hover:border-accent-300 hover:shadow-sm",
        selected ? "border-accent-500 ring-1 ring-accent-500" : "border-neutral-200/80"
      )}
    >
      <div className="flex items-start gap-3">
        {onSelect && (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onSelect(e.target.checked)}
            className="mt-2 h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
          />
        )}
        {row.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.photoUrl} alt={name} className="h-12 w-12 rounded-xl object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100 text-sm font-bold text-accent-700">
            {initials || "?"}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">{name}</h3>
              <p className="text-xs text-neutral-500 truncate">{row.email}</p>
            </div>
            <StatusBadge status={row.status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-neutral-50 p-2">
          <span className="block text-neutral-400">Campus</span>
          <span className="font-medium text-neutral-900 truncate">{row.preferredCampus?.name || "—"}</span>
        </div>
        <div className="rounded-lg bg-neutral-50 p-2">
          <span className="block text-neutral-400">Venue</span>
          <span className="font-medium text-neutral-900 truncate">{row.assignedVenue?.name || "—"}</span>
        </div>
        <div className="rounded-lg bg-neutral-50 p-2">
          <span className="block text-neutral-400">{type === "TEACHER" ? "Tribe" : "Category"}</span>
          <span className="font-medium text-neutral-900 truncate">
            {type === "TEACHER" ? row.assignedTribe?.name || "—" : row.volunteerCategory || "—"}
          </span>
        </div>
        <div className="rounded-lg bg-neutral-50 p-2">
          <span className="block text-neutral-400">Phone</span>
          <span className="font-medium text-neutral-900 truncate">{row.phone || "—"}</span>
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
