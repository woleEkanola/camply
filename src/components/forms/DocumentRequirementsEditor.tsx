"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";

interface Props {
  organizationId: string;
}

export function DocumentRequirementsEditor({ organizationId }: Props) {
  const [newReq, setNewReq] = useState({
    name: "",
    description: "",
    required: true,
    scope: "CAMPER" as "CAMPER" | "REGISTRATION",
    acceptedFormats: "jpg,png",
    maxSizeMb: 2,
  });
  const [deleteReqTarget, setDeleteReqTarget] = useState<{ id: string; name: string } | null>(null);
  const [editReq, setEditReq] = useState<{
    id: string;
    name: string;
    description: string;
    acceptedFormats: string;
    maxSizeMb: number;
  } | null>(null);

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const campId = activeCamp?.id ?? "";
  const utils = api.useUtils();

  const { data: requirements = [], refetch: refetchRequirements } =
    api.documentRequirement.listByCamp.useQuery(
      { campId },
      { enabled: !!campId }
    );

  const createRequirement = api.documentRequirement.create.useMutation({
    onSuccess: () => {
      refetchRequirements();
      setNewReq({ name: "", description: "", required: true, scope: "CAMPER", acceptedFormats: "jpg,png", maxSizeMb: 2 });
    },
  });

  const deleteRequirement = api.documentRequirement.delete.useMutation({
    onSuccess: () => {
      setDeleteReqTarget(null);
      refetchRequirements();
    },
  });

  const toggleRequirement = api.documentRequirement.update.useMutation({
    onSuccess: () => refetchRequirements(),
  });

  const updateRequirement = api.documentRequirement.update.useMutation({
    onSuccess: () => {
      setEditReq(null);
      refetchRequirements();
    },
  });

  if (!activeCamp) {
    return (
      <Card>
        <CardBody>
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-neutral-700">No active camp</p>
            <p className="mt-1 text-xs text-neutral-500">
              Set an active camp in <a href="/admin/camps" className="text-accent-600 underline">Camp Settings</a> before managing required documents.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="space-y-2">
          {requirements?.map((req: any) => (
            <div key={req.id} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
              <div>
                <div className="font-medium text-neutral-900">
                  {req.name}{" "}
                  {req.required && <Badge tone="danger" className="ml-1">required</Badge>}
                </div>
                <div className="text-xs text-neutral-500">
                  {req.scope === "CAMPER" ? "Reusable across camps" : "Specific to this camp"}
                  {req.description ? ` · ${req.description}` : ""}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  {req.acceptedFormats} · Up to {req.maxSizeMb} MB
                </div>
              </div>
              <div className="flex gap-3 text-sm">
                <button
                  className="text-neutral-700 hover:underline"
                  onClick={() =>
                    setEditReq({
                      id: req.id,
                      name: req.name,
                      description: req.description ?? "",
                      acceptedFormats: req.acceptedFormats,
                      maxSizeMb: req.maxSizeMb,
                    })
                  }
                >
                  Edit
                </button>
                <button
                  className="text-accent-700 hover:underline"
                  onClick={() => toggleRequirement.mutate({ id: req.id, data: { required: !req.required } })}
                >
                  {req.required ? "Make Optional" : "Make Required"}
                </button>
                <button
                  className="text-danger-600 hover:underline"
                  onClick={() => setDeleteReqTarget({ id: req.id, name: req.name })}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {requirements?.length === 0 && (
            <p className="text-sm text-neutral-500">No document requirements yet.</p>
          )}
        </div>

        {/* Add new requirement */}
        <div className="grid grid-cols-1 items-end gap-2 border-t border-neutral-200 pt-4 md:grid-cols-4">
          <Input
            containerClassName="md:col-span-2"
            label="Document Name"
            value={newReq.name}
            onChange={(e) => setNewReq({ ...newReq, name: e.target.value })}
            placeholder="e.g. Birth Certificate"
          />
          <Select
            label="Scope"
            value={newReq.scope}
            onChange={(e) => setNewReq({ ...newReq, scope: e.target.value as any })}
          >
            <option value="CAMPER">Camper (reusable)</option>
            <option value="REGISTRATION">Registration (per camp)</option>
          </Select>
          <Input
            label="Formats"
            value={newReq.acceptedFormats}
            onChange={(e) => setNewReq({ ...newReq, acceptedFormats: e.target.value })}
            placeholder="jpg,png"
          />
          <Input
            label="Max Size (MB)"
            type="number"
            value={newReq.maxSizeMb || ""}
            onChange={(e) =>
              setNewReq({ ...newReq, maxSizeMb: e.target.value === "" ? 0 : Number(e.target.value) })
            }
          />
          <Button
            disabled={!newReq.name}
            loading={createRequirement.isPending}
            onClick={() => createRequirement.mutate({ campId, ...newReq })}
          >
            Add
          </Button>
        </div>

        {/* Edit requirement */}
        {editReq && (
          <Dialog open onClose={() => setEditReq(null)}>
            <div className="p-4">
              <h3 className="text-lg font-semibold">Edit Document Requirement</h3>
              <div className="mt-4 space-y-3">
                <Input
                  label="Document Name"
                  value={editReq.name}
                  onChange={(e) => setEditReq({ ...editReq, name: e.target.value })}
                />
                <Input
                  label="Description"
                  value={editReq.description}
                  onChange={(e) => setEditReq({ ...editReq, description: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Formats"
                    value={editReq.acceptedFormats}
                    onChange={(e) => setEditReq({ ...editReq, acceptedFormats: e.target.value })}
                    placeholder="jpg,png"
                  />
                  <Input
                    label="Max Size (MB)"
                    type="number"
                    value={editReq.maxSizeMb || ""}
                    onChange={(e) =>
                      setEditReq({ ...editReq, maxSizeMb: e.target.value === "" ? 0 : Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditReq(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!editReq.name || !editReq.maxSizeMb}
                  loading={updateRequirement.isPending}
                  onClick={() =>
                    updateRequirement.mutate({
                      id: editReq.id,
                      data: {
                        name: editReq.name,
                        description: editReq.description,
                        acceptedFormats: editReq.acceptedFormats,
                        maxSizeMb: editReq.maxSizeMb,
                      },
                    })
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          </Dialog>
        )}

        {/* Delete confirmation */}
        {deleteReqTarget && (
          <Dialog open onClose={() => setDeleteReqTarget(null)}>
            <div className="p-4">
              <h3 className="text-lg font-semibold">Remove Document Requirement</h3>
              <p className="mt-2 text-sm text-neutral-600">
                Are you sure you want to remove &ldquo;{deleteReqTarget.name}&rdquo;? Existing uploaded documents will be preserved.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDeleteReqTarget(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  loading={deleteRequirement.isPending}
                  onClick={() => deleteRequirement.mutate({ id: deleteReqTarget.id })}
                >
                  Remove
                </Button>
              </div>
            </div>
          </Dialog>
        )}
      </CardBody>
    </Card>
  );
}
