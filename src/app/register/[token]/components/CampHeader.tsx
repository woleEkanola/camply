"use client";

import type { CampData } from "../types";

interface CampHeaderProps {
  campData: CampData;
}

export function CampHeader({ campData }: CampHeaderProps) {
  return (
    <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-neutral-900">{campData.campName}</h2>
        <p className="text-sm text-neutral-500">{campData.organizationName}</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
        <span>Campus: {campData.campusName}</span>
        {campData.ageRange && <span>Ages {campData.ageRange}</span>}
        {campData.closesAt && <span>Closes {campData.closesAt}</span>}
      </div>
    </div>
  );
}
