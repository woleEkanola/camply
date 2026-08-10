"use client";

import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { UserIcon, UserGroupIcon } from "@heroicons/react/24/outline";

interface StaffHierarchyTabProps {
  staffId: string;
}

export function StaffHierarchyTab({ staffId }: StaffHierarchyTabProps) {
  const { data: profile } = api.staff.getById.useQuery({ id: staffId });
  const { data: reportingOptions } = api.staff.listReportsToOptions.useQuery(
    { organizationId: profile?.organizationId ?? "", campId: profile?.campId ?? "", excludeStaffId: staffId },
    { enabled: !!profile?.organizationId && !!profile?.campId }
  );

  const utils = api.useUtils();
  const updateReportsTo = api.staff.assignReportsTo.useMutation({
    onSuccess: () => {
      utils.staff.getById.invalidate({ id: staffId });
    },
  });

  if (!profile) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-accent-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Reports To</h2>
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-surface-raised p-4">
          <span className={cn("text-sm font-medium", profile.reportsTo || profile.reportsToUser ? "text-neutral-900" : "text-neutral-500")}>
            {profile.reportsTo
              ? `${profile.reportsTo.firstName} ${profile.reportsTo.lastName}`
              : profile.reportsToUser
                ? `${profile.reportsToUser.firstName ?? ""} ${profile.reportsToUser.lastName ?? ""}`.trim() || profile.reportsToUser.email
                : "No manager assigned"}
          </span>
          <select
            className="rounded-lg border-neutral-300 text-sm"
            aria-label="Reports To"
            value={profile.reportsToId ? `staff:${profile.reportsToId}` : profile.reportsToUserId ? `user:${profile.reportsToUserId}` : ""}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(":");
              updateReportsTo.mutate({
                id: staffId,
                reportsToId: kind === "staff" && id ? id : null,
                reportsToUserId: kind === "user" && id ? id : null,
              });
            }}
          >
            <option value="">— No manager —</option>
            {reportingOptions?.leaders.map((leader) => (
              <option key={`user:${leader.id}`} value={`user:${leader.id}`}>
                {`${leader.firstName ?? ""} ${leader.lastName ?? ""}`.trim() || leader.email} ({leader.role === "OWNER" ? "Camp Director" : leader.role === "ADMIN" ? "Camp Administrator" : "Campus Representative"})
              </option>
            ))}
            {reportingOptions?.staff.map((staff) => (
              <option key={`staff:${staff.id}`} value={`staff:${staff.id}`}>
                {staff.firstName} {staff.lastName} ({staff.type})
              </option>
            ))}
          </select>
          {updateReportsTo.isError && <p className="text-xs text-danger-600">{updateReportsTo.error.message}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <UserGroupIcon className="h-5 w-5 text-accent-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Direct Reports</h2>
        </div>
        {profile.directReports && profile.directReports.length > 0 ? (
          <ul className="divide-y divide-neutral-100">
            {profile.directReports.map((report: any) => (
              <li key={report.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-neutral-900">
                  {report.firstName} {report.lastName}
                </span>
                <span className="text-xs text-neutral-500">{report.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl bg-surface-raised p-4 text-sm text-neutral-500">No direct reports.</div>
        )}
      </div>
    </div>
  );
}
