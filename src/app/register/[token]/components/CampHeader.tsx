"use client";

import type { CampData } from "../types";

interface CampHeaderProps {
  campData: CampData;
}

const STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "Open", tone: "bg-success-100 text-success-700" },
  CLOSED: { label: "Closed", tone: "bg-danger-100 text-danger-700" },
  DRAFT: { label: "Coming Soon", tone: "bg-warning-100 text-warning-700" },
  ARCHIVED: { label: "Archived", tone: "bg-neutral-200 text-neutral-700" },
};

export function CampHeader({ campData }: CampHeaderProps) {
  const badge = STATUS_BADGE[campData.status] ?? STATUS_BADGE.DRAFT;

  return (
    <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">{campData.campName}</h2>
          <p className="text-sm text-neutral-500">{campData.organizationName}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.tone}`}>
          {badge.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
        <span>Campus: {campData.campusName}</span>
        <span>Year: {campData.year}</span>
        {campData.minAge != null && campData.maxAge != null && (
          <span>Ages {campData.minAge}–{campData.maxAge}</span>
        )}
      </div>
    </div>
  );
}
