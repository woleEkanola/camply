"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { api } from "@/utils/trpc";
import { PhoneIcon } from "@heroicons/react/24/solid";

interface CampusTeachersSheetProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  campusId: string;
  campusName?: string;
}

/**
 * Full list of a campus's approved teachers with phone + Call buttons —
 * reached via the lookup overlay's "More" button, so a volunteer can reach
 * anyone from a camper's campus quickly in an emergency. Fetched lazily
 * (only while this sheet is open) since it's a longer list than the
 * one-or-two campus reps already shown inline in the lookup overlay.
 */
export function CampusTeachersSheet({ open, onClose, organizationId, campusId, campusName }: CampusTeachersSheetProps) {
  const { data: teachers, isLoading } = api.scan.getCampusTeachers.useQuery(
    { organizationId, campusId },
    { enabled: open && !!campusId }
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={campusName ? `${campusName} — Teachers` : "Campus Teachers"} snap="full">
      {isLoading && <p className="text-sm text-txt-muted py-6 text-center">Loading teachers…</p>}
      {!isLoading && teachers?.length === 0 && (
        <p className="text-sm text-txt-muted py-6 text-center">No approved teachers found for this campus.</p>
      )}
      <div className="divide-y divide-border-subtle">
        {teachers?.map((teacher) => (
          <div key={teacher.id} className="py-3 flex items-center justify-between gap-3">
            <span className="font-semibold text-txt-primary truncate">{teacher.name}</span>
            {teacher.phone ? (
              <a
                href={`tel:${teacher.phone}`}
                className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm font-bold text-white min-h-[44px] shrink-0"
              >
                <PhoneIcon className="h-4 w-4" />
                {teacher.phone}
              </a>
            ) : (
              <span className="text-xs text-txt-muted shrink-0">No phone on file</span>
            )}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
