"use client";

import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type CommunicationType = "ACCEPTANCE" | "REJECTION" | "CORRECTION" | "WAITLIST";

interface CommunicationRow {
  type: CommunicationType;
  label: string;
}

const COMMUNICATION_TYPES: CommunicationRow[] = [
  { type: "ACCEPTANCE", label: "Acceptance Email" },
  { type: "REJECTION", label: "Rejection Email" },
  { type: "CORRECTION", label: "Correction Request" },
  { type: "WAITLIST", label: "Waitlist Notification" },
];

interface CommunicationCardProps {
  registration: any;
}

export function CommunicationCard({ registration }: CommunicationCardProps) {
  const utils = api.useUtils();

  const sendCommunication = api.registration.sendCommunication.useMutation({
    onSuccess: () => {
      utils.registration.getById.invalidate({ id: registration.id });
    },
  });

  // Camp Invitation is a separate template/pipeline from the four
  // communicationLog-tracked emails above (carries the ID-card PDF, sent via
  // a campaign not a direct side effect), so it gets its own one-off resend
  // rather than reusing sendCommunication/communicationLog.
  const invitationResend = api.communication.invitationResend.useMutation();
  const canResendInvitation = ["APPROVED", "CHECKED_IN"].includes(registration.status);

  const communicationLog: Record<string, string> =
    (registration.communicationLog as Record<string, string>) ?? {};

  const handleSend = (type: CommunicationType) => {
    sendCommunication.mutate({
      registrationId: registration.id,
      type,
    });
  };

  const handleResendInvitation = () => {
    if (!registration.campId) return;
    invitationResend.mutate({ campId: registration.campId, registrationIds: [registration.id] });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-900">Communications</h3>
      </div>
      <div className="divide-y divide-neutral-100">
        {canResendInvitation && (
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-700">Camp Invitation (ID card)</span>
              {invitationResend.isSuccess && <Badge tone="success">SENT</Badge>}
              {invitationResend.isError && <Badge tone="danger">FAILED</Badge>}
            </div>
            <Button size="sm" variant="secondary" loading={invitationResend.isPending} onClick={handleResendInvitation}>
              Resend
            </Button>
          </div>
        )}
        {invitationResend.isError && (
          <p className="px-4 pb-2 text-xs text-danger-600">
            {invitationResend.error instanceof Error ? invitationResend.error.message : "Could not resend the invitation."}
          </p>
        )}
        {COMMUNICATION_TYPES.map((row) => {
          const status = communicationLog[row.type] ?? "NOT_SENT";
          const isSent = status === "SENT";

          return (
            <div
              key={row.type}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-700">
                  {row.label}
                </span>
                <Badge tone={isSent ? "success" : "neutral"}>
                  {isSent ? "SENT" : "NOT SENT"}
                </Badge>
              </div>
              <Button
                size="sm"
                variant={isSent ? "secondary" : "primary"}
                loading={sendCommunication.isPending && sendCommunication.variables?.type === row.type}
                onClick={() => handleSend(row.type)}
              >
                {isSent ? "Resend" : "Send"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
