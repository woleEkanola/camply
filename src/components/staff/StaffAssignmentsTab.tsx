"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { UsersIcon, BuildingOfficeIcon } from "@heroicons/react/24/outline";

interface StaffAssignmentsTabProps {
  staffId: string;
  campId: string;
}

export function StaffAssignmentsTab({ staffId, campId }: StaffAssignmentsTabProps) {
  const [addSecondaryId, setAddSecondaryId] = useState("");
  const { data: profile } = api.staff.getById.useQuery({ id: staffId });
  const { data: venues = [] } = api.venue.getByCamp.useQuery({ campId }, { enabled: !!campId });
  const { data: tribes = [] } = api.tribe.listByCamp.useQuery({ campId }, { enabled: !!campId && profile?.type === "TEACHER" });
  const { data: departments = [] } = api.department.list.useQuery({ organizationId: profile?.organizationId ?? "", campId }, { enabled: !!profile?.organizationId });
  const { data: memberships = [] } = api.departmentOperations.staffDepartmentMemberships.useQuery({ staffId }, { enabled: !!staffId });

  const utils = api.useUtils();
  const invalidateAssignments = () => { utils.staff.getById.invalidate({ id: staffId }); utils.departmentOperations.staffDepartmentMemberships.invalidate({ staffId }); };
  const assignVenue = api.staff.assignVenue.useMutation({ onSuccess: () => utils.staff.getById.invalidate({ id: staffId }) });
  const assignTribe = api.staff.assignTribe.useMutation({ onSuccess: () => utils.staff.getById.invalidate({ id: staffId }) });
  const assignDepartment = api.staff.assignDepartment.useMutation({ onSuccess: invalidateAssignments });
  const setDepartmentHead = api.staff.setDepartmentHead.useMutation({ onSuccess: () => utils.staff.getById.invalidate({ id: staffId }) });
  const setPrimaryDepartment = api.departmentOperations.setPrimaryDepartment.useMutation({ onSuccess: invalidateAssignments });
  const addSecondaryDepartment = api.departmentOperations.addSecondaryDepartment.useMutation({ onSuccess: () => { setAddSecondaryId(""); invalidateAssignments(); } });
  const removePerson = api.departmentOperations.removePerson.useMutation({ onSuccess: invalidateAssignments });

  if (!profile) return null;

  const secondaryMemberships = memberships.filter((membership) => !membership.isPrimary);
  const takenDepartmentIds = new Set(memberships.map((membership) => membership.departmentId));
  const addableDepartments = departments.filter((department: any) => !takenDepartmentIds.has(department.id));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-raised p-4">
          <span className="text-sm font-medium text-neutral-900">{profile.assignedVenue?.name || "Not assigned"}</span>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-neutral-500">Venue</label>
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
      </div>

      {profile.type === "TEACHER" ? (
        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Tribe</h2>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-raised p-4">
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
        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <BuildingOfficeIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Volunteer Category</h2>
          </div>
          <div className="rounded-xl bg-surface-raised p-4 text-sm font-medium text-neutral-900">
            {profile.volunteerCategory || "Not categorized"}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs md:col-span-2">
        <div className="flex flex-col gap-4 rounded-xl bg-surface-raised p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-medium text-neutral-900">{profile.department?.name || "Not assigned"}</span>
              {profile.isDepartmentHead && <span className="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-700">Head</span>}
              {profile.isAssistantHead && <span className="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-700">Assistant Head</span>}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-neutral-500">Department</label>
              <select
                aria-label="Primary department"
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

          {profile.departmentId && (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={profile.isDepartmentHead}
                  onChange={(e) => setDepartmentHead.mutate({ id: staffId, isDepartmentHead: e.target.checked })}
                  className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                />
                Department Head
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={profile.isAssistantHead}
                  onChange={(e) => setDepartmentHead.mutate({ id: staffId, isAssistantHead: e.target.checked })}
                  className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                />
                Assistant Department Head
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs md:col-span-2">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Secondary departments</h2>
        {secondaryMemberships.length === 0 ? (
          <p className="text-sm text-txt-secondary">Not attached to any other department.</p>
        ) : (
          <ul className="divide-y divide-border-subtle" data-testid="secondary-departments-list">
            {secondaryMemberships.map((membership) => (
              <li key={membership.departmentId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="text-sm">
                  <span className="font-medium text-neutral-900" data-testid={`secondary-department-name-${membership.departmentId}`}>{membership.departmentName}</span>
                  {membership.roles.length > 0 && <span className="ml-2 text-xs text-txt-muted">{membership.roles.map((role) => role.positionName).join(", ")}</span>}
                  {!membership.departmentActive && <span className="ml-2 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-800">Inactive</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" loading={setPrimaryDepartment.isPending} onClick={() => setPrimaryDepartment.mutate({ staffId, departmentId: membership.departmentId })}>Make primary</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={removePerson.isPending}
                    onClick={() => membership.roles.forEach((role) => removePerson.mutate({ assignmentId: role.assignmentId }))}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {profile.departmentId && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
            <select aria-label="Add to another department" className="rounded-lg border-neutral-300 text-sm" value={addSecondaryId} onChange={(e) => setAddSecondaryId(e.target.value)}>
              <option value="">Add to another department…</option>
              {addableDepartments.map((department: any) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
            <Button variant="secondary" size="sm" disabled={!addSecondaryId} loading={addSecondaryDepartment.isPending} onClick={() => addSecondaryDepartment.mutate({ staffId, departmentId: addSecondaryId })}>Add</Button>
          </div>
        )}
      </div>

      {profile.type === "TEACHER" && profile.camperAssignments && profile.camperAssignments.length > 0 && (
        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs md:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Assigned Campers</h2>
          <ul className="divide-y divide-border-subtle">
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
