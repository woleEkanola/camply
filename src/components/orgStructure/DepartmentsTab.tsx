"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { DepartmentSidePanel } from "./DepartmentSidePanel";

interface DepartmentsTabProps {
  organizationId: string;
  campId: string;
}

export function DepartmentsTab({ organizationId, campId }: { organizationId: string; campId: string }) {
  const utils = api.useUtils();
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  
  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");

  // tRPC calls
  const { data: departments = [], isLoading } = api.orgStructure.getDepartmentStructure.useQuery({
    organizationId,
    campId,
  });

  const invalidate = () => {
    utils.orgStructure.getDepartmentStructure.invalidate({ organizationId, campId });
    utils.department.list.invalidate({ organizationId, campId });
    utils.position.getHierarchy.invalidate({ campId });
  };

  const createDept = api.department.create.useMutation({
    onSuccess: () => {
      setCreateOpen(false);
      setName("");
      setDescription("");
      setMaxCapacity("");
      invalidate();
    },
  });

  const duplicateDept = api.department.duplicate.useMutation({
    onSuccess: invalidate,
  });

  const mergeDept = api.department.merge.useMutation({
    onSuccess: () => {
      setMergeOpen(false);
      setMergeSourceId(null);
      setMergeTargetId("");
      invalidate();
    },
  });

  const archiveDept = api.department.archive.useMutation({
    onSuccess: invalidate,
  });

  if (isLoading) return <p className="text-sm text-neutral-500">Loading Departments…</p>;

  return (
    <div className="space-y-6">
      {/* Header action bar */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Manage Departments</h2>
          <p className="text-xs text-neutral-500">Create, edit, duplicate, or merge organization units.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Add Department</Button>
      </div>

      {departments.length === 0 ? (
        <EmptyState title="No departments yet" description="Create a department to start organizing teams." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d: any) => (
            <Card
              key={d.id}
              className="cursor-pointer hover:border-neutral-300 transition-colors group relative"
              onClick={() => setSelectedDeptId(d.id)}
            >
              <CardBody>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold text-neutral-900">{d.name}</h3>
                  <Badge tone={d.status === "ACTIVE" ? "success" : "neutral"}>{d.status}</Badge>
                </div>
                
                <p className="text-xs text-neutral-500 line-clamp-2 min-h-[32px] mb-3">
                  {d.description || "No description provided."}
                </p>

                <div className="mb-4 grid grid-cols-2 gap-y-1 text-[11px] text-neutral-500">
                  <div>Head: <span className="font-medium text-neutral-800">{d.head?.name ?? "Vacant"}</span></div>
                  <div>Volunteers: <span className="font-medium text-neutral-800">{d.volunteerCount}</span></div>
                  <div>Members: <span className="font-medium text-neutral-800">{d.memberCount}</span></div>
                  <div>Capacity: <span className="font-medium text-neutral-800">{d.signedUpCount}/{d.maxCapacity ?? "∞"}</span></div>
                </div>

                {/* Operations Menu — StopPropagation to prevent opening panel */}
                <div
                  className="flex items-center gap-1.5 border-t border-neutral-100 pt-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={duplicateDept.isPending}
                    onClick={() => duplicateDept.mutate({ id: d.id })}
                  >
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setMergeSourceId(d.id);
                      setMergeOpen(true);
                    }}
                  >
                    Merge
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={archiveDept.isPending}
                    onClick={() => archiveDept.mutate({ id: d.id })}
                  >
                    Archive
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* ── Add Department Dialog ── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Department">
        <div className="space-y-4">
          <Input label="Name" placeholder="e.g. Registration" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea label="Description" placeholder="Optional responsibilities or details" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <Input type="number" min={1} label="Max Capacity (optional)" helpText="Leave blank for unlimited" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!name.trim()}
              loading={createDept.isPending}
              onClick={() =>
                createDept.mutate({
                  organizationId,
                  campId,
                  name: name.trim(),
                  description: description.trim() || undefined,
                  maxCapacity: maxCapacity ? Number(maxCapacity) : undefined,
                })
              }
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ── Merge Department Dialog ── */}
      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge Department">
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">
            Merge all positions and staff members from this department into a target department. 
            The source department will be archived.
          </p>
          <Select
            label="Target Department"
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
          >
            <option value="">Select target department…</option>
            {departments
              .filter((d: any) => d.id !== mergeSourceId)
              .map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button
              disabled={!mergeTargetId}
              loading={mergeDept.isPending}
              onClick={() =>
                mergeSourceId &&
                mergeDept.mutate({
                  sourceId: mergeSourceId,
                  targetId: mergeTargetId,
                })
              }
            >
              Merge Departments
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Detail side panel */}
      {selectedDeptId && (
        <DepartmentSidePanel
          organizationId={organizationId}
          campId={campId}
          departmentId={selectedDeptId}
          onClose={() => setSelectedDeptId(null)}
        />
      )}
    </div>
  );
}
