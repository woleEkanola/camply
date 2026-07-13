"use client";

import type { CampData } from "../types";

interface CampHeaderProps {
  campData: CampData;
}

export function CampHeader({ campData }: CampHeaderProps) {
  return (
    <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">{campData.campName}</h2>
          <p className="text-sm text-neutral-500">{campData.organizationName}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Verified
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
        <span>Campus: {campData.campusName}</span>
        {campData.ageRange && <span>Ages {campData.ageRange}</span>}
        {campData.closesAt && <span>Closes {campData.closesAt}</span>}
      </div>
    </div>
  );
}
