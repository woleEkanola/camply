"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Textarea, Select } from "@/components/ui/Input";
import { CheckIcon, PaperAirplaneIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface ApproveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: { sendEmail: boolean }) => void;
  isPending?: boolean;
  camperName?: string;
}

export function ApproveDecisionDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  camperName,
}: ApproveDialogProps) {
  const [sendEmail, setSendEmail] = useState(true);

  return (
    <Dialog open={open} onClose={onClose} title="Approve Registration?" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Are you sure you want to approve registration for <strong className="text-neutral-900">{camperName || "this camper"}</strong>?
          This will update the registration status to <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">APPROVED</span>.
        </p>

        <label className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 text-sm font-medium text-neutral-700 cursor-pointer hover:bg-neutral-100/70 transition">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
          />
          <span>Send approval confirmation email to parent immediately</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            loading={isPending}
            onClick={() => onConfirm({ sendEmail })}
          >
            <CheckIcon className="mr-1.5 h-4 w-4" />
            Approve Registration
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface RequestCorrectionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { reasons: string[]; message: string; saveAsTemplate?: boolean }) => void;
  isPending?: boolean;
  initialMessage?: string;
}

const CORRECTION_REASONS = [
  { id: "birth_cert", label: "Birth Certificate" },
  { id: "consent_form", label: "Consent Form" },
  { id: "medical_form", label: "Medical Form" },
  { id: "camper_info", label: "Camper Information" },
  { id: "parent_info", label: "Parent Information" },
  { id: "other", label: "Other" },
];

export function RequestCorrectionDecisionDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  initialMessage = "",
}: RequestCorrectionDialogProps) {
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [message, setMessage] = useState(initialMessage);
  const [saveTemplate, setSaveTemplate] = useState(false);

  useEffect(() => {
    setMessage(initialMessage);
  }, [initialMessage, open]);

  const toggleReason = (label: string) => {
    setSelectedReasons((prev) =>
      prev.includes(label) ? prev.filter((r) => r !== label) : [...prev, label]
    );
  };

  const handleSend = () => {
    if (!message.trim()) return;
    onConfirm({
      reasons: selectedReasons,
      message: message.trim(),
      saveAsTemplate: saveTemplate,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Request Correction" size="md">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Select items requiring attention and provide clear instructions for the parent.
        </p>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-2">
            Correction Category / Reasons
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CORRECTION_REASONS.map((item) => {
              const isChecked = selectedReasons.includes(item.label);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleReason(item.label)}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition text-left ${
                    isChecked
                      ? "border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // handled by parent button click
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5">
            Correction Message for Parent <span className="text-rose-500">*</span>
          </label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Please upload a signed parental consent form. The current uploaded document is incomplete."
            rows={4}
            className="w-full text-sm"
          />
          <div className="mt-1 flex justify-between text-xs text-neutral-500">
            <span>The parent will receive this message via email with a direct upload link.</span>
            <span>{message.length}/500</span>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 cursor-pointer">
          <input
            type="checkbox"
            checked={saveTemplate}
            onChange={(e) => setSaveTemplate(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
          />
          <span>Save message as reusable template for future corrections</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="bg-amber-600 text-white hover:bg-amber-700"
            disabled={!message.trim()}
            loading={isPending}
            onClick={handleSend}
          >
            <PaperAirplaneIcon className="mr-1.5 h-4 w-4" />
            Send Correction Request
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface RejectDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { reasonCategory: string; additionalNotes: string }) => void;
  isPending?: boolean;
}

const REJECTION_REASONS = [
  "Age requirement not met",
  "Missing mandatory documents",
  "Duplicate registration",
  "Invalid information",
  "Outside camp operating area",
  "Other",
];

export function RejectDecisionDialog({
  open,
  onClose,
  onConfirm,
  isPending,
}: RejectDialogProps) {
  const [reasonCategory, setReasonCategory] = useState(REJECTION_REASONS[0]);
  const [additionalNotes, setAdditionalNotes] = useState("");

  const handleReject = () => {
    onConfirm({
      reasonCategory,
      additionalNotes: additionalNotes.trim(),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Reject Registration?" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          This registration will be rejected. Please select a documented reason to include in the notification to the parent.
        </p>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5">
            Primary Rejection Reason
          </label>
          <Select
            value={reasonCategory}
            onChange={(e) => setReasonCategory(e.target.value)}
          >
            {REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5">
            Additional Rejection Notes
          </label>
          <Textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Add specific details explaining why this application was rejected..."
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={isPending}
            onClick={handleReject}
          >
            <XMarkIcon className="mr-1.5 h-4 w-4" />
            Reject Registration
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
