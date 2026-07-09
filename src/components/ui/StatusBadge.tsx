import { Badge, type BadgeTone } from "./Badge";

/**
 * Canonical RegistrationStatus -> visual tone mapping. This is the single
 * source of truth for status color meaning across the app — do not
 * reintroduce a local STATUS_COLORS map on a page, import this instead.
 */
export const REGISTRATION_STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  PENDING: "warning",
  REQUIRES_ACTION: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  WAITLISTED: "attention",
  CANCELLED: "neutral",
  CHECKED_IN: "success",
  COMPLETED: "success",
  ARCHIVED: "neutral",
};

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tone = REGISTRATION_STATUS_TONE[status] ?? "neutral";
  return (
    <Badge tone={tone} className={className}>
      {statusLabel(status)}
    </Badge>
  );
}
