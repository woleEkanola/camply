"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { BuildingOfficeIcon, MoonIcon, HomeIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { ManualSpaceReassignmentModal } from "@/components/accommodation/ManualSpaceReassignmentModal";

interface StaffAccommodationTabProps {
  staffId: string;
  campId: string;
}

export function StaffAccommodationTab({ staffId, campId }: StaffAccommodationTabProps) {
  const utils = api.useUtils();
  const [spaceModalOpen, setSpaceModalOpen] = useState(false);
  const { data: profile } = api.staff.getById.useQuery({ id: staffId });

  if (!profile) return null;

  const handleSuccess = () => {
    utils.staff.getById.invalidate({ id: staffId });
    utils.staff.adminList.invalidate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface p-4 rounded-2xl border border-border-default shadow-xs">
        <div>
          <h2 className="text-base font-bold text-neutral-900">Room & Bed Assignment</h2>
          <p className="text-xs text-txt-secondary mt-0.5">
            View or update this {profile.type === "TEACHER" ? "teacher's" : "volunteer's"} assigned accommodation.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setSpaceModalOpen(true)}
          className="whitespace-nowrap"
        >
          Manually Reassign Hostel / Room / Bed
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <BuildingOfficeIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Hostel</h2>
          </div>
          <div className="rounded-xl bg-surface-raised p-4">
            <span className="text-sm font-medium text-neutral-900">
              {profile.assignedHostel?.name || "Not assigned"}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <HomeIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Room</h2>
          </div>
          <div className="rounded-xl bg-surface-raised p-4">
            <span className="text-sm font-medium text-neutral-900">
              {profile.assignedRoom?.name || "Not assigned"}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <MoonIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Bed</h2>
          </div>
          <div className="rounded-xl bg-surface-raised p-4">
            <span className="text-sm font-medium text-neutral-900">
              {profile.assignedBed?.label || "Not assigned"}
            </span>
          </div>
        </div>
      </div>

      {spaceModalOpen && (
        <ManualSpaceReassignmentModal
          open={spaceModalOpen}
          onClose={() => setSpaceModalOpen(false)}
          occupant={{
            id: staffId,
            name: `${profile.firstName} ${profile.lastName}`.trim(),
            type: "STAFF",
            staffType: profile.type,
            gender: profile.gender,
            photoUrl: profile.photoUrl,
            tribeName: profile.assignedTribe?.name,
            currentHostelName: profile.assignedHostel?.name,
            currentRoomName: profile.assignedRoom?.name,
            currentBedLabel: profile.assignedBed?.label,
          }}
          organizationId={profile.organizationId}
          campId={campId}
          venueId={profile.assignedVenueId ?? undefined}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
