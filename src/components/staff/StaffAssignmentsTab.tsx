"use client";

import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { MapPinIcon, UsersIcon, AcademicCapIcon, BuildingOfficeIcon } from "@heroicons/react/24/outline";

interface StaffAssignmentsTabProps {
  staffId: string;
  campId: string;
}

export function StaffAssignmentsTab({ staffId, campId }: StaffAssignmentsTabProps) {
  const { data: profile } = api.staff.getById.useQuery({ id: staffId });
  const { data: venues = [] } = api.venue.getByCamp.useQuery({ campId }, { enabled: !!campId });
  const { data: tribes = [] } = api.tribe.listByCamp.useQuery({ campId }, { enabled: !!campId && profile?.type === "TEACHER" });
  const { data: departments = [] } = api.department.list.useQuery({ organizationId: profile?.organizationId ?? "", campId }, { enabled: !!profile?.organizationId });

  const utils = api.useUtils();
  const assignVenue = api.staff.assignVenue.useMutation({ onSuccess: () => utils.staff.getById.invalidate({ id: staffId }) });
  const assignTribe = api.staff.assignTribe.useMutation({ onSuccess: () => utils.staff.getById.invalidate({ id: staffId }) });
  const assignDepartment = api.staff.assignDepartment.useMutation({ onSuccess: () => utils.staff.getById.invalidate({ id: staffId }) });

  if (!profile) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <MapPinIcon className="h-5 w-5 text-accent-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Venue</h2>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-neutral-50 p-4">
          <span className="text-sm font-medium text-neutral-900">{profile.assignedVenue?.name || "Not assigned"}</span>
          <select
            className="rounded-lg border-neutral-300 text-sm"
            value={profile.assignedVenueId || ""}
            onChange={(e) => assignVenue.mutate({ id: staffId, venueId: e.target.value || null })}
          >
            <option value="">— Unassign —</option>
            {venues.map((v: any) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
      </div>

      {profile.type === "TEACHER" ? (
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Tribe</h2>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl bg-neutral-50 p-4">
            <span className="text-sm font-medium text-neutral-900">{profile.assignedTribe?.name || "Not assigned"}</span>
            <select
              className="rounded-lg border-neutral-300 text-sm"
              value={profile.assignedTribeId || ""}
              onChange={(e) => assignTribe.mutate({ id: staffId, tribeId: e.target.value || null })}
            >
              <option value="">— Unassign —</option>
              {tribes.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <BuildingOfficeIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Volunteer Category</h2>
          </div>
          <div className="rounded-xl bg-neutral-50 p-4 text-sm font-medium text-neutral-900">
            {profile.volunteerCategory || "Not categorized"}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs md:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <AcademicCapIcon className="h-5 w-5 text-accent-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Department</h2>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-neutral-50 p-4">
          <div className="text-sm">
            <span className="font-medium text-neutral-900">{profile.department?.name || "Not assigned"}</span>
            {profile.isDepartmentHead && <span className="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-700">Head</span>}
            {profile.isAssistantHead && <span className="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-700">Assistant Head</span>}
          </div>
          <select
            className="rounded-lg border-neutral-300 text-sm"
            value={profile.departmentId || ""}
            onChange={(e) => assignDepartment.mutate({ id: staffId, departmentId: e.target.value || null })}
          >
            <option value="">— Unassign —</option>
            {departments.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {profile.type === "TEACHER" && profile.camperAssignments && profile.camperAssignments.length > 0 && (
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs md:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Assigned Campers</h2>
          <ul className="divide-y divide-neutral-100">
            {profile.camperAssignments.map((ca: any) => (
              <li key={ca.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-neutral-900">
                  {ca.registration?.camper?.firstName} {ca.registration?.camper?.lastName}
                </span>
                <span className="text-xs text-neutral-500">{ca.registration?.tribe?.name || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
