"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Input";
import {
  CAMP_COMMAND_PERMISSIONS,
  CAMP_COMMAND_PERMISSION_LABELS,
  type CampCommandPermission,
} from "@/lib/campCommand";

type Mode = "INHERIT" | "FULL" | "CUSTOM";

function PermissionGrid({ value, onChange }: { value: string[]; onChange: (next: CampCommandPermission[]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CAMP_COMMAND_PERMISSIONS.map((permission) => (
        <label key={permission} className="flex min-h-11 items-center gap-2 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-txt-primary">
          <input
            type="checkbox"
            checked={permission === "DASHBOARD" || value.includes(permission)}
            disabled={permission === "DASHBOARD"}
            onChange={(event) => onChange(event.target.checked
              ? [...value, permission] as CampCommandPermission[]
              : value.filter((item) => item !== permission) as CampCommandPermission[])}
            className="h-4 w-4 rounded border-input-border text-accent-600 focus:ring-accent-500"
          />
          {CAMP_COMMAND_PERMISSION_LABELS[permission]}{permission === "DASHBOARD" ? " (always available)" : ""}
        </label>
      ))}
    </div>
  );
}

export default function CampCommandSettings({ campId }: { campId: string }) {
  const utils = api.useUtils();
  const { data, isLoading } = api.campCommand.overview.useQuery({ campId });
  const [commandantMode, setCommandantMode] = useState<"FULL" | "CUSTOM">("FULL");
  const [commandantPermissions, setCommandantPermissions] = useState<CampCommandPermission[]>([]);
  const [assistantMode, setAssistantMode] = useState<"FULL" | "CUSTOM">("CUSTOM");
  const [assistantPermissions, setAssistantPermissions] = useState<CampCommandPermission[]>([]);
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState<"COMMANDANT" | "ASSISTANT_COMMANDANT">("COMMANDANT");
  const [appointmentMode, setAppointmentMode] = useState<Mode>("INHERIT");
  const [appointmentPermissions, setAppointmentPermissions] = useState<CampCommandPermission[]>([]);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [editMode, setEditMode] = useState<Mode>("INHERIT");
  const [editPermissions, setEditPermissions] = useState<CampCommandPermission[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [repairReport, setRepairReport] = useState<{ adopted: any[]; splits: number; ambiguous: any[] } | null>(null);

  useEffect(() => {
    if (!data?.policy) return;
    setCommandantMode(data.policy.commandantMode === "CUSTOM" ? "CUSTOM" : "FULL");
    setCommandantPermissions(data.policy.commandantPermissions as CampCommandPermission[]);
    setAssistantMode(data.policy.assistantDefaultMode === "FULL" ? "FULL" : "CUSTOM");
    setAssistantPermissions(data.policy.assistantDefaultPermissions as CampCommandPermission[]);
  }, [data?.policy]);

  const invalidate = async () => {
    await utils.campCommand.overview.invalidate({ campId });
    await utils.position.getHierarchy.invalidate({ campId });
    await utils.orgStructure.getCampDirectory.invalidate();
  };
  const ensure = api.campCommand.ensureStructure.useMutation({
    onSuccess: async (result) => {
      // Only surface the report dialog when there's actually something to
      // report — the very first "Set up Camp Command" click (empty-state
      // button, also wired to this mutation) has nothing adopted/split/
      // ambiguous and shouldn't pop a "nothing to repair" modal in front of
      // the admin mid-setup.
      if (result.adopted.length > 0 || result.splits > 0 || result.ambiguous.length > 0) {
        setRepairReport({ adopted: result.adopted, splits: result.splits, ambiguous: result.ambiguous });
      }
      await invalidate();
    },
  });
  const savePolicy = api.campCommand.updatePolicy.useMutation({
    onSuccess: async () => { setMessage("Camp Command access settings saved."); await invalidate(); },
  });
  const appoint = api.campCommand.appoint.useMutation({
    onSuccess: async () => {
      setMessage(role === "COMMANDANT" ? "Camp Commandant appointed." : "Assistant Camp Commandant appointed.");
      setStaffId("");
      setAppointmentMode("INHERIT");
      setAppointmentPermissions([]);
      await invalidate();
    },
  });
  const updateAccess = api.campCommand.updateAssignmentAccess.useMutation({
    onSuccess: async () => { setEditingAssignment(null); setMessage("Individual access updated."); await invalidate(); },
  });
  const remove = api.campCommand.remove.useMutation({
    onSuccess: async () => { setMessage("Camp Command appointment removed."); await invalidate(); },
  });

  const positions = data?.positions ?? [];
  const assignments = useMemo(() => positions.flatMap((position: any) =>
    position.assignments.map((assignment: any) => ({ ...assignment, leadershipRole: position.leadershipRole }))), [positions]);
  const commandant = assignments.find((assignment: any) => assignment.leadershipRole === "COMMANDANT");
  const appointedTeacherIds = new Set(assignments.map((assignment: any) => assignment.staff.id));
  const eligibleTeachers = (data?.teachers ?? []).filter((teacher: any) => !appointedTeacherIds.has(teacher.id));

  if (isLoading) return <p className="text-sm text-txt-secondary">Loading Camp Command settings…</p>;

  if (!data?.policy || positions.length === 0) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-bold text-txt-primary">Camp Command</h3>
          <p className="text-sm text-txt-secondary">Create the protected Camp Command department and place it at the top of the organogram.</p>
        </div>
        <Button loading={ensure.isPending} onClick={() => ensure.mutate({ campId })}>Set up Camp Command</Button>
      </div>
    );
  }

  return (
    <div className="space-y-7" data-testid="camp-command-settings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-txt-primary">Camp Command</h3>
          <p className="text-sm text-txt-secondary">Appoint approved teachers and control their camp-level access. Owner and administrator security controls are never delegated.</p>
        </div>
        <Button variant="secondary" size="sm" loading={ensure.isPending} onClick={() => ensure.mutate({ campId })}>
          Repair Camp Command structure
        </Button>
      </div>

      {message && <p className="rounded-lg status-success px-3 py-2 text-sm">{message}</p>}

      <section className="space-y-4 rounded-xl border border-border-default bg-surface-raised p-4">
        <h4 className="font-semibold text-txt-primary">Default access</h4>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-txt-primary">Camp Commandant</div>
              <div className="text-xs text-txt-secondary">Full camp admin access or selected operational areas.</div>
            </div>
            <Select aria-label="Commandant access mode" value={commandantMode} onChange={(event) => setCommandantMode(event.target.value as "FULL" | "CUSTOM")}>
              <option value="FULL">Full camp admin access</option>
              <option value="CUSTOM">Selected permissions</option>
            </Select>
          </div>
          {commandantMode === "CUSTOM" && <PermissionGrid value={commandantPermissions} onChange={setCommandantPermissions} />}
        </div>
        <div className="space-y-3 border-t border-border-default pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-txt-primary">Assistant Commandants</div>
              <div className="text-xs text-txt-secondary">These defaults apply unless an individual override is set.</div>
            </div>
            <Select aria-label="Assistant access mode" value={assistantMode} onChange={(event) => setAssistantMode(event.target.value as "FULL" | "CUSTOM")}>
              <option value="FULL">Full camp admin access</option>
              <option value="CUSTOM">Selected permissions</option>
            </Select>
          </div>
          {assistantMode === "CUSTOM" && <PermissionGrid value={assistantPermissions} onChange={setAssistantPermissions} />}
        </div>
        <div className="flex justify-end">
          <Button loading={savePolicy.isPending} onClick={() => savePolicy.mutate({ campId, commandantMode, commandantPermissions, assistantDefaultMode: assistantMode, assistantDefaultPermissions: assistantPermissions })}>
            Save access settings
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border-default p-4">
        <div>
          <h4 className="font-semibold text-txt-primary">Appoint a teacher</h4>
          <p className="text-xs text-txt-secondary">Only approved teachers registered for this camp are eligible.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select aria-label="Teacher" value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            <option value="">Select approved teacher…</option>
            {eligibleTeachers.map((teacher: any) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}
          </Select>
          <Select aria-label="Command role" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="COMMANDANT">Camp Commandant</option>
            <option value="ASSISTANT_COMMANDANT">Assistant Commandant</option>
          </Select>
          <Select aria-label="Individual access" value={appointmentMode} onChange={(event) => setAppointmentMode(event.target.value as Mode)}>
            <option value="INHERIT">Use role default</option>
            <option value="FULL">Full camp admin access</option>
            <option value="CUSTOM">Custom access</option>
          </Select>
        </div>
        {appointmentMode === "CUSTOM" && <PermissionGrid value={appointmentPermissions} onChange={setAppointmentPermissions} />}
        <Button disabled={!staffId || (role === "COMMANDANT" && Boolean(commandant))} loading={appoint.isPending} onClick={() => appoint.mutate({ campId, staffId, role, accessMode: appointmentMode, permissions: appointmentPermissions })}>
          {role === "COMMANDANT" ? "Appoint Camp Commandant" : "Add Assistant Commandant"}
        </Button>
        {role === "COMMANDANT" && commandant && <p className="text-xs text-txt-secondary">Remove or replace the current commandant before making another appointment.</p>}
      </section>

      <section className="space-y-3">
        <h4 className="font-semibold text-txt-primary">Current Camp Command</h4>
        {assignments.length === 0 ? <p className="text-sm text-txt-secondary">No one has been appointed yet.</p> : assignments.map((assignment: any) => (
          <div key={assignment.id} className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-txt-primary">{assignment.staff.firstName} {assignment.staff.lastName}</div>
              <div className="text-xs text-txt-secondary">{assignment.leadershipRole === "COMMANDANT" ? "Camp Commandant" : "Assistant Camp Commandant"} · {assignment.accessMode === "INHERIT" || !assignment.accessMode ? "Role default access" : assignment.accessMode === "FULL" ? "Full camp admin access" : "Custom access"}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setEditingAssignment(assignment); setEditMode(assignment.accessMode ?? "INHERIT"); setEditPermissions(assignment.permissions ?? []); }}>Edit access</Button>
              <Button variant="danger" size="sm" loading={remove.isPending} onClick={() => remove.mutate({ assignmentId: assignment.id })}>Remove</Button>
            </div>
          </div>
        ))}
      </section>

      <Dialog open={Boolean(editingAssignment)} onClose={() => setEditingAssignment(null)} title="Edit Camp Command access" size="lg">
        <div className="space-y-4">
          <Select label="Access mode" value={editMode} onChange={(event) => setEditMode(event.target.value as Mode)}>
            <option value="INHERIT">Use role default</option>
            <option value="FULL">Full camp admin access</option>
            <option value="CUSTOM">Custom access</option>
          </Select>
          {editMode === "CUSTOM" && <PermissionGrid value={editPermissions} onChange={setEditPermissions} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingAssignment(null)}>Cancel</Button>
            <Button loading={updateAccess.isPending} onClick={() => editingAssignment && updateAccess.mutate({ assignmentId: editingAssignment.id, accessMode: editMode, permissions: editPermissions })}>Save access</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!repairReport} onClose={() => setRepairReport(null)} title="Camp Command structure repair" size="sm">
        {repairReport && (
          <div className="space-y-3 text-sm text-txt-secondary">
            {repairReport.adopted.length === 0 && repairReport.splits === 0 && repairReport.ambiguous.length === 0 ? (
              <p>Structure already clean — nothing to repair.</p>
            ) : (
              <>
                {repairReport.adopted.length > 0 && (
                  <p>Adopted {repairReport.adopted.length} previously-untagged role{repairReport.adopted.length === 1 ? "" : "s"} instead of creating duplicates: {repairReport.adopted.map((a: any) => a.name).join(", ")}.</p>
                )}
                {repairReport.splits > 0 && (
                  <p>Split {repairReport.splits} shared assistant assignment{repairReport.splits === 1 ? "" : "s"} into distinct, individually-manageable roles.</p>
                )}
                {repairReport.ambiguous.length > 0 && (
                  <p className="text-warning-800">{repairReport.ambiguous.length} role{repairReport.ambiguous.length === 1 ? "" : "s"} look like duplicates but couldn&apos;t be auto-resolved — review and merge them from the Organogram tab.</p>
                )}
              </>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setRepairReport(null)}>Close</Button></div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
