"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";

export function DepartmentDetailPanel({ department, onClose }: { department: any; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title={department.name} size="lg">
      <div className="space-y-4">
        {department.description && <p className="text-sm text-neutral-600">{department.description}</p>}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-neutral-500">Department Head</span><div className="font-medium text-neutral-900">{department.head?.name ?? "Unassigned"}</div></div>
          <div><span className="text-neutral-500">Assistant Head</span><div className="font-medium text-neutral-900">{department.assistantHead?.name ?? "Unassigned"}</div></div>
          <div><span className="text-neutral-500">Members</span><div className="font-medium text-neutral-900">{department.memberCount}</div></div>
          <div><span className="text-neutral-500">Volunteers</span><div className="font-medium text-neutral-900">{department.volunteerCount}</div></div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Responsibilities</h3>
          {department.responsibilities?.length > 0 ? (
            <ul className="list-inside list-disc space-y-1 text-sm text-neutral-700">
              {department.responsibilities.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No responsibilities defined yet. An admin can add them from the Departments tab.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">Announcements</h3>
            <p className="text-sm text-neutral-500">No department announcements yet.</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">Schedules</h3>
            <p className="text-sm text-neutral-500">No schedule posted yet.</p>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Status</h3>
          <Badge tone={department.status === "ACTIVE" ? "success" : "neutral"}>{department.status}</Badge>
        </div>
      </div>
    </Dialog>
  );
}
