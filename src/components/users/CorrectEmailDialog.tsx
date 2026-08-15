"use client";

import { useEffect, useState } from "react";
import { api } from "@/utils/trpc";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { normalizeEmail } from "@/lib/email";

export type CorrectEmailTarget = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export function CorrectEmailDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: CorrectEmailTarget | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setNewEmail("");
    setConfirmEmail("");
    setReason("");
    setError("");
  }, [target?.id]);

  const mutation = api.user.correctEmail.useMutation({
    onSuccess: (result) => {
      const message = result.warning
        ? `Email changed to ${result.newEmail}. ${result.warning}`
        : `Email changed to ${result.newEmail}. Both addresses were notified.`;
      onSuccess(message);
      onClose();
    },
    onError: (mutationError) => setError(mutationError.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!target) return;
    if (normalizeEmail(newEmail) !== normalizeEmail(confirmEmail)) {
      setError("The new email addresses do not match.");
      return;
    }
    mutation.mutate({ userId: target.id, newEmail, reason });
  };

  const displayName = target
    ? `${target.firstName ?? ""} ${target.lastName ?? ""}`.trim() || target.email
    : "this user";

  return (
    <Dialog open={!!target} onClose={onClose} title="Correct Email Address" size="md">
      <form onSubmit={submit} className="space-y-4" data-testid="correct-email-form">
        <div className="rounded-md status-attention border border-current/15 p-3 text-sm">
          <p className="font-semibold">This changes how {displayName} signs in.</p>
          <p className="mt-1">They will be signed out and must log in again with the new address. Their password will not change.</p>
        </div>

        {error && <div className="rounded-md status-danger p-3 text-sm" role="alert">{error}</div>}

        <Input label="Current email address" value={target?.email ?? ""} readOnly disabled />
        <Input
          label="New email address"
          type="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          required
          autoComplete="off"
          data-testid="new-email"
        />
        <Input
          label="Confirm new email address"
          type="email"
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          required
          autoComplete="off"
          data-testid="confirm-new-email"
        />
        <div>
          <label htmlFor="email-correction-reason" className="mb-1 block text-sm font-medium text-txt-primary">
            Reason for correction
          </label>
          <textarea
            id="email-correction-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            minLength={5}
            maxLength={500}
            rows={3}
            placeholder="For example: User entered a typo during registration"
            className="block w-full rounded-md border border-input-border bg-input-bg px-3 py-2 text-sm text-txt-primary shadow-sm placeholder:text-txt-muted focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            data-testid="email-correction-reason"
          />
          <p className="mt-1 text-xs text-txt-muted">This reason and your account will be saved in the audit history.</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending} data-testid="submit-email-correction">Change Email & Sign User Out</Button>
        </div>
      </form>
    </Dialog>
  );
}
