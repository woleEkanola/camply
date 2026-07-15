"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { isEndorsed } from "@/server/registration/endorsement";

type Action = "APPROVE" | "REJECT" | "WAITLIST" | "REQUEST_CORRECTION" | "CANCEL" | "ARCHIVE";

interface StatusDialogProps {
  open: boolean;
  onClose: () => void;
  registration: any;
  onSubmit: (action: Action, opts: { reason?: string; message?: string; sendEmail?: boolean }) => void;
  isTwoStep?: boolean;
  review?: { verificationStatus?: string | null; recommendation?: string | null } | null;
}

const ACTION_OPTIONS: { value: Action; label: string }[] = [
  { value: "APPROVE", label: "Approve" },
  { value: "REJECT", label: "Reject" },
  { value: "WAITLIST", label: "Waitlist" },
  { value: "REQUEST_CORRECTION", label: "Request Correction" },
  { value: "CANCEL", label: "Cancel" },
  { value: "ARCHIVE", label: "Archive" },
];

export function StatusDialog({ open, onClose, registration, onSubmit, isTwoStep, review }: StatusDialogProps) {
  const [action, setAction] = useState<Action>("APPROVE");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [venueId, setVenueId] = useState(registration?.venueId ?? "");

  useEffect(() => {
    if (open) {
      setAction("APPROVE");
      setReason("");
      setMessage("");
      setSendEmail(true);
      setVenueId(registration?.venueId ?? "");
    }
  }, [open, registration?.venueId]);

  const handleSubmit = () => {
    onSubmit(action, {
      reason: action === "REJECT" || action === "CANCEL" ? reason || undefined : undefined,
      message: action === "REQUEST_CORRECTION" ? message : undefined,
      sendEmail: ["APPROVE", "REJECT", "WAITLIST", "REQUEST_CORRECTION"].includes(action) ? sendEmail : undefined,
    });
  };

  const isSubmitDisabled = (() => {
    switch (action) {
      case "REJECT":
        return !reason.trim();
      case "REQUEST_CORRECTION":
        return !message.trim();
      default:
        return false;
    }
  })();

  const venues = registration?.camp?.venues ?? [];

  const renderFields = () => {
    switch (action) {
      case "APPROVE":
        return (
          <div className="space-y-4">
            {isTwoStep && !isEndorsed(review) && (
              <div className="rounded-md bg-attention-50 p-3 text-sm text-attention-700">
                This registration has not been endorsed by a campus rep. Approving now is an admin override.
              </div>
            )}
            {venues.length > 0 && (
              <Select
                label="Venue"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                <option value="">Select a venue (optional)</option>
                {venues.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
            {registration?.registrationNumber && (
              <div className="rounded-md bg-neutral-50 p-3 text-sm">
                <span className="text-neutral-500">Registration Number: </span>
                <span className="font-medium text-neutral-900">{registration.registrationNumber}</span>
              </div>
            )}
            {registration?.tribeSuggestion && !registration?.tribeId && (
              <div className="rounded-md bg-info-50 p-3 text-sm text-info-700">
                <strong>Tribe Suggestion:</strong> {registration.tribeSuggestion.tribeName} ({registration.tribeSuggestion.confidence}% confidence)
                {registration.tribeSuggestion.reasons?.length > 0 && (
                  <div className="mt-1 text-xs text-info-600">
                    {registration.tribeSuggestion.reasons.join(", ")}
                  </div>
                )}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
              />
              Send acceptance email
            </label>
          </div>
        );

      case "REJECT":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Reason <span className="text-danger-600">*</span>
              </label>
              <textarea
                className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                rows={3}
                placeholder="Why is this registration being rejected?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
              />
              Send rejection email
            </label>
          </div>
        );

      case "WAITLIST":
        return (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              This registration will be moved to the waitlist. The parent will be notified when a spot becomes available.
            </p>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
              />
              Send waitlist notification
            </label>
          </div>
        );

      case "REQUEST_CORRECTION":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Message <span className="text-danger-600">*</span>
              </label>
              <textarea
                className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                rows={3}
                placeholder="What needs to be corrected?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
              />
              Notify parent
            </label>
          </div>
        );

      case "CANCEL":
        return (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Reason
              </label>
              <textarea
                className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                rows={2}
                placeholder="Optional reason for cancellation"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
        );

      case "ARCHIVE":
        return (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              This registration will be archived. Archived registrations are hidden from the main list but can be viewed in the archive.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change Status"
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={
              action === "REJECT"
                ? "danger"
                : action === "CANCEL" || action === "ARCHIVE"
                  ? "secondary"
                  : "primary"
            }
            disabled={isSubmitDisabled}
            onClick={handleSubmit}
          >
            {action === "APPROVE"
              ? "Approve Registration"
              : action === "REJECT"
                ? "Reject Registration"
                : action === "WAITLIST"
                  ? "Move to Waitlist"
                  : action === "REQUEST_CORRECTION"
                    ? "Request Correction"
                    : action === "CANCEL"
                      ? "Cancel Registration"
                      : "Archive Registration"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Select
          label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value as Action)}
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        <div
          className={cn(
            "rounded-lg border border-neutral-200 p-4",
            action === "REJECT" && "border-danger-200 bg-danger-50/30",
            action === "APPROVE" && "border-success-200 bg-success-50/30",
            action === "WAITLIST" && "border-attention-200 bg-attention-50/30",
            action === "REQUEST_CORRECTION" && "border-warning-200 bg-warning-50/30",
          )}
        >
          {renderFields()}
        </div>
      </div>
    </Dialog>
  );
}
