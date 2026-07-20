"use client";

import { Badge } from "@/components/ui/Badge";
import { EnvelopeIcon, EyeIcon, CursorArrowRaysIcon } from "@heroicons/react/24/outline";
import type { EmailRecipient } from "@prisma/client";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    QUEUED: "warning", SENT: "info", DELIVERED: "success", OPENED: "success", CLICKED: "success",
    FAILED: "danger", BOUNCED: "danger", CANCELLED: "neutral",
  };
  return map[status] ?? "neutral";
}

function sourceLabel(source?: string | null): string {
  const map: Record<string, string> = {
    REGISTRATION_APPROVED: "Registration Approved",
    REGISTRATION_REJECTED: "Registration Rejected",
    REGISTRATION_SUBMITTED: "Registration Submitted",
    CORRECTION_REQUESTED: "Correction Requested",
    REGISTRATION_WAITLISTED: "Waitlisted",
    STAFF_APPROVED: "Staff Approved",
    STAFF_REJECTED: "Staff Rejected",
    OTP_EMAIL: "OTP",
    WELCOME_EMAIL: "Welcome Email",
    BROADCAST: "Broadcast",
    CAMPAIGN: "Campaign",
  };
  return source ? (map[source] ?? source.replace(/_/g, " ")) : "Email";
}

function groupByDate(events: any[]): { label: string; events: any[] }[] {
  const groups: { label: string; events: any[] }[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const grouped = new Map<string, any[]>();
  for (const e of events) {
    const date = new Date(e.createdAt).toDateString();
    const key = date === today ? "Today" : date === yesterday ? "Yesterday" : date;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  for (const [label, items] of grouped) {
    groups.push({ label, events: items });
  }
  return groups;
}

export function CommunicationTimeline({ events, emptyText = "No communication history yet." }: { events: any[]; emptyText?: string }) {
  if (events.length === 0) {
    return <p className="text-sm text-neutral-500">{emptyText}</p>;
  }

  const groups = groupByDate(events);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{group.label}</p>
          <div className="space-y-2">
            {group.events.map((event: any) => (
              <div key={event.id} className="flex items-start gap-3 rounded-lg border border-neutral-100 p-3">
                <div className={`mt-0.5 rounded-full p-1.5 ${event.deliveryStatus === "FAILED" || event.deliveryStatus === "BOUNCED" ? "bg-red-50 text-red-500" : event.openedAt ? "bg-green-50 text-green-500" : "bg-neutral-50 text-neutral-400"}`}>
                  <EnvelopeIcon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(event.deliveryStatus)}>{event.deliveryStatus}</Badge>
                    <span className="text-sm font-medium text-neutral-800 truncate">
                      {event.campaign?.name ?? sourceLabel(event.deliverySource)}
                    </span>
                  </div>
                  {event.subject && <p className="mt-0.5 text-xs text-neutral-500 truncate">{event.subject}</p>}
                  <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
                    {event.openedAt && (
                      <span className="flex items-center gap-1"><EyeIcon className="h-3 w-3" /> Opened</span>
                    )}
                    {event.clickedAt && (
                      <span className="flex items-center gap-1"><CursorArrowRaysIcon className="h-3 w-3" /> Clicked</span>
                    )}
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
