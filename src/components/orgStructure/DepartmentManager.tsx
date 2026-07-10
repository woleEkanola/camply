"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { DepartmentDetailPanel } from "@/components/orgStructure/DepartmentDetailPanel";

export function DepartmentManager({ organizationId, campId }: { organizationId: string; campId: string }) {
  const utils = api.useUtils();
  const { data: departments = [], isLoading } = api.orgStructure.getDepartmentStructure.useQuery({ organizationId, campId }, { enabled: !!organizationId && !!campId });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [responsibilitiesText, setResponsibilitiesText] = useState("");

  const invalidate = () => {
    utils.orgStructure.getDepartmentStructure.invalidate({ organizationId, campId });
    utils.department.list.invalidate({ organizationId, campId });
  };
  const create = api.department.create.useMutation({ onSuccess: () => { setCreateOpen(false); setName(""); setDescription(""); invalidate(); } });
  const remove = api.department.delete.useMutation({ onSuccess: invalidate });
  const updateResponsibilities = api.department.updateResponsibilities.useMutation({ onSuccess: () => { setEditing(null); invalidate(); } });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Departments</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>Add Department</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : departments.length === 0 ? (
        <EmptyState title="No departments yet" description="Create departments to organize volunteers and set responsibilities." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d: any) => (
            <Card key={d.id} className="cursor-pointer hover:border-accent-300" onClick={() => setViewing(d)}>
              <CardBody>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-medium text-neutral-900">{d.name}</h3>
                  <Badge tone="neutral">{d.responsibilities?.length ?? 0} responsibilities</Badge>
                </div>
                <div className="mb-3 space-y-1 text-xs text-neutral-500">
                  <div>Head: <span className="text-neutral-700">{d.head?.name ?? "Unassigned"}</span></div>
                  <div>Members: <span className="text-neutral-700">{d.memberCount}</span> · Volunteers: <span className="text-neutral-700">{d.volunteerCount}</span></div>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditing(d);
                      setResponsibilitiesText((d.responsibilities ?? []).join("\n"));
                    }}
                  >
                    Edit Responsibilities
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: d.id })}>Delete</Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add Department">
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          <Button
            className="w-full"
            disabled={!name}
            loading={create.isPending}
            onClick={() => create.mutate({ organizationId, campId, name, description: description || undefined })}
          >
            Create
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={`${editing?.name ?? ""} — Responsibilities`}>
        <div className="space-y-3">
          <Textarea
            label="One responsibility per line"
            value={responsibilitiesText}
            onChange={(e) => setResponsibilitiesText(e.target.value)}
            rows={8}
          />
          <Button
            className="w-full"
            loading={updateResponsibilities.isPending}
            onClick={() =>
              updateResponsibilities.mutate({
                id: editing.id,
                responsibilities: responsibilitiesText.split("\n").map((r) => r.trim()).filter(Boolean),
              })
            }
          >
            Save
          </Button>
        </div>
      </Dialog>

      {viewing && <DepartmentDetailPanel department={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
