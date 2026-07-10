"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Drawer } from "@/components/ui/Drawer";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Select } from "@/components/ui/Input";
import { SearchBar } from "@/components/ui/SearchBar";

export function StaffDetailDrawer({ staffId, organizationId, yearId, onClose }: { staffId: string; organizationId: string; yearId: string; onClose: () => void }) {
  const utils = api.useUtils();
  const { data: profile } = api.staff.getById.useQuery({ id: staffId });
  const { data: locations = [] } = api.location.getByOrganization.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: tribes = [] } = api.tribe.listByYear.useQuery({ yearId }, { enabled: !!yearId && profile?.type === "TEACHER" });
  const { data: departments = [] } = api.department.list.useQuery({ organizationId, yearId }, { enabled: !!organizationId && !!yearId });
  const { data: reportsToOptions } = api.staff.listReportsToOptions.useQuery(
    { organizationId, yearId, excludeStaffId: staffId },
    { enabled: !!organizationId && !!yearId }
  );
  const { data: hostels = [] } = api.accommodation.listHostels.useQuery(
    { locationId: profile?.assignedLocationId ?? "" },
    { enabled: !!profile?.assignedLocationId && profile?.type === "TEACHER" }
  );

  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState("");

  const invalidate = () => {
    utils.staff.getById.invalidate({ id: staffId });
    utils.staff.adminList.invalidate();
    utils.staff.stats.invalidate();
  };
  const onErr = (e: { message: string }) => setActionError(e.message);

  const approve = api.staff.approve.useMutation({ onSuccess: invalidate, onError: onErr });
  const reject = api.staff.reject.useMutation({ onSuccess: () => { setRejectReason(""); invalidate(); }, onError: onErr });
  const deactivate = api.staff.deactivate.useMutation({ onSuccess: invalidate, onError: onErr });
  const reactivate = api.staff.reactivate.useMutation({ onSuccess: invalidate, onError: onErr });
  const assignCentre = api.staff.assignCentre.useMutation({ onSuccess: invalidate, onError: onErr });
  const assignTribe = api.staff.assignTribe.useMutation({ onSuccess: invalidate, onError: onErr });
  const assignDepartment = api.staff.assignDepartment.useMutation({ onSuccess: invalidate, onError: onErr });
  const assignReportsTo = api.staff.assignReportsTo.useMutation({ onSuccess: invalidate, onError: onErr });
  const setDepartmentHead = api.staff.setDepartmentHead.useMutation({ onSuccess: invalidate, onError: onErr });
  const setTribeMonitor = api.staff.setTribeMonitor.useMutation({ onSuccess: invalidate, onError: onErr });
  const assignHostel = api.staff.assignHostel.useMutation({ onSuccess: invalidate, onError: onErr });
  const assignRoom = api.staff.assignRoom.useMutation({ onSuccess: invalidate, onError: onErr });

  if (!profile) {
    return <Drawer open onClose={onClose} title="Loading…"><div className="p-6 text-sm text-neutral-500">Loading…</div></Drawer>;
  }

  const profileTab = (
    <div className="space-y-4">
      {actionError && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{actionError}</div>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><span className="text-neutral-500">Phone</span><div className="font-medium text-neutral-900">{profile.phone}</div></div>
        <div><span className="text-neutral-500">Gender</span><div className="font-medium text-neutral-900">{profile.gender || "—"}</div></div>
        <div><span className="text-neutral-500">Church</span><div className="font-medium text-neutral-900">{profile.church || "—"}</div></div>
        <div><span className="text-neutral-500">Department</span><div className="font-medium text-neutral-900">{profile.churchDepartment || "—"}</div></div>
        {profile.type === "TEACHER" ? (
          <>
            <div><span className="text-neutral-500">Preferred Age Group</span><div className="font-medium text-neutral-900">{profile.preferredAgeGroup || "—"}</div></div>
            <div><span className="text-neutral-500">Areas of Strength</span><div className="font-medium text-neutral-900">{profile.areasOfStrength || "—"}</div></div>
          </>
        ) : (
          <div><span className="text-neutral-500">Category</span><div className="font-medium text-neutral-900">{profile.volunteerCategory || "—"}</div></div>
        )}
        <div><span className="text-neutral-500">Skills</span><div className="font-medium text-neutral-900">{(profile.skills || []).join(", ") || "—"}</div></div>
        <div><span className="text-neutral-500">Allergies</span><div className="font-medium text-neutral-900">{profile.allergies || "None reported"}</div></div>
        <div><span className="text-neutral-500">Medical Conditions</span><div className="font-medium text-neutral-900">{profile.medicalConditions || "None reported"}</div></div>
        <div><span className="text-neutral-500">Emergency Contact</span><div className="font-medium text-neutral-900">{profile.emergencyContactName ? `${profile.emergencyContactName} (${profile.emergencyContactPhone})` : "—"}</div></div>
      </div>

      {profile.fieldValues && profile.fieldValues.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Additional Questions</h3>
          <div className="space-y-1 text-sm">
            {profile.fieldValues.map((fv: any) => (
              <div key={fv.id}><span className="text-neutral-500">{fv.field.label}</span>: <span className="text-neutral-900">{fv.value}</span></div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-900">Review</h3>
        {profile.status === "PENDING" && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" loading={approve.isPending} onClick={() => approve.mutate({ id: staffId })}>Approve</Button>
            </div>
            <div className="flex gap-2">
              <SearchBar containerClassName="flex-1" placeholder="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <Button variant="danger" size="sm" disabled={!rejectReason} loading={reject.isPending} onClick={() => reject.mutate({ id: staffId, reason: rejectReason })}>Reject</Button>
            </div>
          </>
        )}
        {profile.status === "APPROVED" && (
          <Button variant="secondary" size="sm" loading={deactivate.isPending} onClick={() => deactivate.mutate({ id: staffId })}>Deactivate</Button>
        )}
        {profile.status === "DEACTIVATED" && (
          <Button variant="secondary" size="sm" loading={reactivate.isPending} onClick={() => reactivate.mutate({ id: staffId })}>Reactivate</Button>
        )}
      </div>
    </div>
  );

  const assignmentTab = (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Centre</label>
        <Select value={profile.assignedLocationId ?? ""} onChange={(e) => assignCentre.mutate({ id: staffId, locationId: e.target.value || null })}>
          <option value="">Unassigned</option>
          {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>

      {profile.type === "TEACHER" && (
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Tribe</label>
          <Select value={profile.assignedTribeId ?? ""} onChange={(e) => assignTribe.mutate({ id: staffId, tribeId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {tribes.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Department</label>
        <Select value={profile.departmentId ?? ""} onChange={(e) => assignDepartment.mutate({ id: staffId, departmentId: e.target.value || null })}>
          <option value="">Unassigned</option>
          {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={profile.isDepartmentHead}
            onChange={(e) => setDepartmentHead.mutate({ id: staffId, isDepartmentHead: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
          />
          Department Head
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={profile.isAssistantHead}
            onChange={(e) => setDepartmentHead.mutate({ id: staffId, isAssistantHead: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
          />
          Assistant Department Head
        </label>
        {profile.type === "TEACHER" && (
          <>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={profile.isCampMonitor}
                onChange={(e) => setTribeMonitor.mutate({ id: staffId, isCampMonitor: e.target.checked })}
                className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
              />
              Camp Monitor
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={profile.isAssistantMonitor}
                onChange={(e) => setTribeMonitor.mutate({ id: staffId, isAssistantMonitor: e.target.checked })}
                className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
              />
              Assistant Camp Monitor
            </label>
          </>
        )}
      </div>
    </div>
  );

  const hierarchyTab = (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Reports To</label>
        <Select
          value={profile.reportsToId ? `staff:${profile.reportsToId}` : profile.reportsToUserId ? `user:${profile.reportsToUserId}` : ""}
          onChange={(e) => {
            const [kind, id] = e.target.value.split(":");
            if (!id) {
              assignReportsTo.mutate({ id: staffId, reportsToId: null, reportsToUserId: null });
            } else if (kind === "staff") {
              assignReportsTo.mutate({ id: staffId, reportsToId: id, reportsToUserId: null });
            } else {
              assignReportsTo.mutate({ id: staffId, reportsToId: null, reportsToUserId: id });
            }
          }}
        >
          <option value="">Unassigned</option>
          {reportsToOptions?.leaders?.map((l: any) => (
            <option key={`user:${l.id}`} value={`user:${l.id}`}>
              {`${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || l.email} ({l.role === "OWNER" ? "Camp Director" : l.role === "ADMIN" ? "Camp Administrator" : "Centre Manager"})
            </option>
          ))}
          {reportsToOptions?.staff?.map((s: any) => (
            <option key={`staff:${s.id}`} value={`staff:${s.id}`}>{s.firstName} {s.lastName} ({s.type})</option>
          ))}
        </Select>
        {assignReportsTo.isError && <p className="mt-1 text-xs text-danger-600">{assignReportsTo.error?.message}</p>}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-900">Direct Reports</h3>
        {profile.directReports && profile.directReports.length > 0 ? (
          <ul className="space-y-1 text-sm text-neutral-700">
            {profile.directReports.map((r: any) => (
              <li key={r.id}>{r.firstName} {r.lastName}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No one reports to this person yet.</p>
        )}
      </div>
    </div>
  );

  const accommodationTab = (
    <div className="space-y-4">
      {profile.type !== "TEACHER" ? (
        <p className="text-sm text-neutral-500">Hostel/room assignment is only available for teachers.</p>
      ) : !profile.assignedLocationId ? (
        <p className="text-sm text-neutral-500">Assign a centre first to pick a hostel.</p>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Hostel</label>
            <Select
              value={profile.assignedHostelId ?? ""}
              onChange={(e) => {
                assignHostel.mutate({ id: staffId, hostelId: e.target.value || null });
                assignRoom.mutate({ id: staffId, roomId: null });
              }}
            >
              <option value="">Unassigned</option>
              {hostels.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </div>
          {profile.assignedHostelId && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Room</label>
              <Select value={profile.assignedRoomId ?? ""} onChange={(e) => assignRoom.mutate({ id: staffId, roomId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {hostels.find((h: any) => h.id === profile.assignedHostelId)?.rooms.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${profile.firstName} ${profile.lastName}`}
      subtitle={<StatusBadge status={profile.status} />}
    >
      <Tabs
        tabs={[
          { label: "Profile", content: profileTab },
          { label: "Assignment", content: assignmentTab },
          { label: "Hierarchy", content: hierarchyTab },
          { label: "Accommodation", content: accommodationTab },
        ]}
      />
    </Drawer>
  );
}
