"use client";

import { useState } from "react";
import {
  PhoneIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DocumentZoomModal } from "@/components/ui/DocumentZoomModal";
import { StaffDetailDrawer } from "@/components/staff/StaffDetailDrawer";
import { toWhatsAppDigits } from "@/lib/phone";
import { cn } from "@/lib/cn";
import type { StaffChip } from "@/server/api/routers/_shared/staffChip";

export interface StaffProfileSheetProps {
  /** null = closed. */
  chip: StaffChip | null;
  organizationId: string;
  campId: string;
  onSite?: boolean;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-2.5 text-sm last:border-0">
      <span className="text-txt-muted">{label}</span>
      <span className="font-medium text-txt-primary">{value}</span>
    </div>
  );
}

/**
 * The <5s payoff: search -> tap -> Call/WhatsApp. Zero network fetch on
 * open — the StaffChip carries everything (photoUrl/phone/department/
 * campus/tribe/hostel/position), which is exactly why getCampDirectory and
 * searchDirectory both return the same chip-complete shape.
 */
export function StaffProfileSheet({ chip, organizationId, campId, onSite, onClose }: StaffProfileSheetProps) {
  const [photoOpen, setPhotoOpen] = useState(false);
  // Captured independently of `chip` — "View full profile" calls onClose(),
  // which the parent handles by nulling its activeChip and thus this `chip`
  // prop. Gating the drawer on `chip` directly would unmount it the instant
  // it should appear.
  const [fullProfileStaffId, setFullProfileStaffId] = useState<string | null>(null);

  const open = !!chip;
  const phone = chip?.phone?.trim() || "";
  const hasPhone = phone.length > 0;
  const waDigits = hasPhone ? toWhatsAppDigits(phone) : null;

  return (
    <>
      <BottomSheet open={open} onClose={onClose} snap="full" testId="staff-profile-sheet">
        {chip && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-2 pt-1 text-center">
              <button
                type="button"
                onClick={() => chip.photoUrl && setPhotoOpen(true)}
                disabled={!chip.photoUrl}
                aria-label={chip.photoUrl ? `View ${chip.displayName}'s photo` : undefined}
                className={cn("rounded-full", chip.photoUrl && "cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500")}
              >
                <Avatar name={chip.displayName} photoUrl={chip.photoUrl} size="xl" />
              </button>
              <div>
                <div className="text-lg font-semibold text-txt-primary">{chip.displayName}</div>
                <div className="text-sm text-txt-secondary">{chip.positionTitle ?? (chip.type === "TEACHER" ? "Teacher" : "Volunteer")}</div>
              </div>
              {onSite && (
                <span className="rounded-full bg-[var(--status-success-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--status-success-fg)]">
                  On site
                </span>
              )}
            </div>

            {hasPhone ? (
              <div className="flex gap-2">
                <a
                  href={`tel:${phone}`}
                  data-testid="staff-call-link"
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 text-sm font-bold text-white hover:bg-accent-700"
                >
                  <PhoneIcon className="h-5 w-5" />
                  Call
                </a>
                {waDigits && (
                  <a
                    href={`https://wa.me/${waDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="staff-whatsapp-link"
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white hover:brightness-95"
                  >
                    <ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" />
                    WhatsApp
                  </a>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border-default py-3 text-center text-sm text-txt-muted">
                No phone on file
              </p>
            )}

            {hasPhone && (
              <div className="flex gap-2">
                <a
                  href={`sms:${phone}`}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-default text-xs font-medium text-txt-secondary hover:bg-surface-raised"
                >
                  <ChatBubbleLeftRightIcon className="h-4 w-4" />
                  SMS
                </a>
                {chip.email && (
                  <a
                    href={`mailto:${chip.email}`}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-default text-xs font-medium text-txt-secondary hover:bg-surface-raised"
                  >
                    <EnvelopeIcon className="h-4 w-4" />
                    Email
                  </a>
                )}
              </div>
            )}

            <div>
              <DetailRow label="Department" value={chip.departmentName} />
              <DetailRow label="Campus" value={chip.campusName} />
              <DetailRow label="Tribe" value={chip.tribeName} />
              <DetailRow label="Hostel" value={chip.hostelName} />
              <DetailRow label="Reports To" value={chip.reportsToName} />
              <DetailRow label="Type" value={chip.type === "TEACHER" ? "Teacher" : "Volunteer"} />
              <DetailRow label="Status" value={chip.status} />
            </div>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setFullProfileStaffId(chip.id);
                onClose();
              }}
            >
              View full profile
            </Button>
          </div>
        )}
      </BottomSheet>

      {chip?.photoUrl && (
        <DocumentZoomModal
          isOpen={photoOpen}
          onClose={() => setPhotoOpen(false)}
          url={chip.photoUrl}
          fileName={chip.displayName}
          fileType="image/*"
          enableDoubleTapZoom
          enableSwipeDownDismiss
        />
      )}

      {fullProfileStaffId && (
        <StaffDetailDrawer
          staffId={fullProfileStaffId}
          organizationId={organizationId}
          campId={campId}
          onClose={() => setFullProfileStaffId(null)}
        />
      )}
    </>
  );
}
