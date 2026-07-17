"use client";

import { Card, CardBody } from "@/components/ui/Card";

interface AuditTimelineProps {
  events: any[];
  title?: string;
  emptyText?: string;
}

export function AuditTimeline({ events, title = "Activity Timeline", emptyText = "No activity recorded yet." }: AuditTimelineProps) {
  return (
    <Card>
      <CardBody>
        <h3 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h3>
        <ul className="space-y-3 text-sm">
          {(events ?? []).length === 0 && <li className="text-neutral-500">{emptyText}</li>}
          {(events ?? []).map((event: any) => (
            <li key={event.id} className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent-500" />
              <div>
                <div className="font-medium text-neutral-700">
                  {event.action?.replace(/_/g, " ") ?? "Activity"}
                </div>
                <div className="text-xs text-neutral-400">
                  {event.createdAt ? new Date(event.createdAt).toLocaleString() : "—"}
                </div>
                {event.metadata && (
                  <div className="mt-1 text-xs text-neutral-500">
                    {formatMetadata(event.metadata)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function formatMetadata(metadata: any) {
  try {
    const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    if (meta.reason) return `Reason: ${meta.reason}`;
    if (meta.message) return `Message: ${meta.message}`;
    if (meta.previousValue && meta.newValue) {
      return `${meta.previousValue.status ?? meta.previousValue} → ${meta.newValue.status ?? meta.newValue}`;
    }
  } catch {
    // ignore
  }
  return null;
}
