"use client";

import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { UserIcon, UserGroupIcon } from "@heroicons/react/24/outline";

interface StaffHierarchyTabProps {
  staffId: string;
}

export function StaffHierarchyTab({ staffId }: StaffHierarchyTabProps) {
  const { data: profile } = api.staff.getById.useQuery({ id: staffId });
  const { data: orgStaffData } = api.staff.adminList.useQuery(
    { organizationId: profile?.organizationId ?? "", campId: profile?.campId ?? "", type: profile?.type ?? "TEACHER", limit: 500 },
    { enabled: !!profile?.organizationId && !!profile?.campId }
  );
  const orgStaff = orgStaffData?.items ?? [];

  const utils = api.useUtils();
  const updateReportsTo = api.staff.assignReportsTo.useMutation({
    onSuccess: () => {
      utils.staff.getById.invalidate({ id: staffId });
    },
  });

  if (!profile) return null;

  const reportingOptions = orgStaff.filter((s: any) => s.id !== staffId);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-accent-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Reports To</h2>
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-surface-raised p-4">
          <span className={cn("text-sm font-medium", profile.reportsTo ? "text-neutral-900" : "text-neutral-500")}>
            {profile.reportsTo ? `${profile.reportsTo.firstName} ${profile.reportsTo.lastName}` : "No manager assigned"}
          </span>
          <select
            className="rounded-lg border-neutral-300 text-sm"
            value={profile.reportsToId || ""}
            onChange={(e) => updateReportsTo.mutate({ id: staffId, reportsToId: e.target.value || null })}
          >
            <option value="">— No manager —</option>
            {reportingOptions.map((s: any) => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
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
