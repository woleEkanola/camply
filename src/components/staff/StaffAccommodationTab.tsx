"use client";

import { api } from "@/utils/trpc";
import { BuildingOfficeIcon, MoonIcon, HomeIcon } from "@heroicons/react/24/outline";

interface StaffAccommodationTabProps {
  staffId: string;
  campId: string;
}

export function StaffAccommodationTab({ staffId, campId }: StaffAccommodationTabProps) {
  const { data: profile } = api.staff.getById.useQuery({ id: staffId });

  if (!profile) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <BuildingOfficeIcon className="h-5 w-5 text-accent-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Hostel</h2>
        </div>
        <div className="rounded-xl bg-neutral-50 p-4">
          <span className="text-sm font-medium text-neutral-900">
            {profile.assignedHostel?.name || "Not assigned"}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <HomeIcon className="h-5 w-5 text-accent-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Room</h2>
        </div>
        <div className="rounded-xl bg-neutral-50 p-4">
          <span className="text-sm font-medium text-neutral-900">
            {profile.assignedRoom?.name || "Not assigned"}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <MoonIcon className="h-5 w-5 text-accent-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Bed</h2>
        </div>
        <div className="rounded-xl bg-neutral-50 p-4">
          <span className="text-sm font-medium text-neutral-900">
            {profile.assignedBed?.label || "Not assigned"}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs md:col-span-2">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Accommodation Notes</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Room and bed assignments are managed from the accommodation page. Changes here are read-only.
        </p>
      </div>
    </div>
  );
}
