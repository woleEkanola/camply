"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";

type ApprovalWorkflow = "SINGLE_STEP" | "TWO_STEP";

export default function ApprovalWorkflowSettings({
  organizationId,
  initialApprovalWorkflow = "SINGLE_STEP",
  onSettingsSaved,
}: {
  organizationId: string;
  initialApprovalWorkflow?: ApprovalWorkflow;
  onSettingsSaved?: () => void;
}) {
  const [approvalWorkflow, setApprovalWorkflow] = useState<ApprovalWorkflow>(initialApprovalWorkflow);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const updateSettings = api.organization.updateSettings.useMutation();

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      await updateSettings.mutateAsync({
        organizationId,
        settings: {},
        approvalWorkflow,
      });
      setSuccess(true);
      if (onSettingsSaved) onSettingsSaved();
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Failed to save approval workflow");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-900">Approval Workflow</h3>
        <p className="text-sm text-neutral-500">
          Control how camper registrations get approved.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3 cursor-pointer has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50">
          <input
            type="radio"
            name="approvalWorkflow"
            className="mt-1 h-4 w-4 text-accent-600"
            checked={approvalWorkflow === "SINGLE_STEP"}
            onChange={() => setApprovalWorkflow("SINGLE_STEP")}
          />
          <span>
            <span className="block text-sm font-semibold text-neutral-900">Single-step</span>
            <span className="block text-sm text-neutral-500">
              A campus representative's approval is final — the acceptance email sends immediately.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3 cursor-pointer has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50">
          <input
            type="radio"
            name="approvalWorkflow"
            className="mt-1 h-4 w-4 text-accent-600"
            checked={approvalWorkflow === "TWO_STEP"}
            onChange={() => setApprovalWorkflow("TWO_STEP")}
          />
          <span>
            <span className="block text-sm font-semibold text-neutral-900">Two-step</span>
            <span className="block text-sm text-neutral-500">
              A campus representative endorses a registration; an organization admin must then give
              final approval. Only final approval sends the acceptance email. Admins may still
              approve directly without an endorsement as an override.
            </span>
          </span>
        </label>
      </div>

      {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
      {success && <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">Approval workflow saved.</div>}

      <div className="flex justify-end pt-2">
        <Button loading={saving} onClick={handleSave}>
          Save Approval Workflow
        </Button>
      </div>
    </div>
  );
}
