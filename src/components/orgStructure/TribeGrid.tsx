"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { TribeDashboardPanel } from "@/components/orgStructure/TribeDashboardPanel";

type TribeFormData = {
  name: string;
  code: string;
  color: string;
  displayOrder: string;
  description: string;
  meaning: string;
  motto: string;
  scripture: string;
  gender: string;
  ageRange: string;
  allocationStrategy: string;
  maxCapacity: string;
};

const emptyForm = (): TribeFormData => ({
  name: "",
  code: "",
  color: "#6D4C41",
  displayOrder: "0",
  description: "",
  meaning: "",
  motto: "",
  scripture: "",
  gender: "MIXED",
  ageRange: "All Ages",
  allocationStrategy: "MANUAL",
  maxCapacity: "",
});

const PRESET_COLORS = [
  "#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA",
  "#6D4C41", "#00897B", "#3949AB", "#C0A000", "#00ACC1",
  "#5E35B1", "#D81B60",
];

function TribeFormFields({
  form,
  onChange,
}: {
  form: TribeFormData;
  onChange: (k: keyof TribeFormData, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Name + Code */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Input
            label="Tribe Name *"
            placeholder="e.g. AGAPE"
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            required
          />
        </div>
        <Input
          label="Code *"
          placeholder="AGP"
          value={form.code}
          onChange={(e) => onChange("code", e.target.value.toUpperCase().slice(0, 10))}
        />
      </div>

      {/* Color */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Colour (HEX)</label>
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange("color", c)}
              className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                borderColor: form.color === c ? "#1a1a1a" : "transparent",
                outline: form.color === c ? "2px solid #fff" : undefined,
                outlineOffset: form.color === c ? "-3px" : undefined,
              }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={form.color}
            onChange={(e) => onChange("color", e.target.value)}
            className="h-7 w-10 cursor-pointer rounded border border-neutral-200 bg-transparent p-0.5"
            title="Custom colour"
          />
          <span className="font-mono text-sm text-neutral-500">{form.color}</span>
        </div>
      </div>

      {/* Meaning + Motto */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Meaning"
          placeholder="e.g. Unconditional Love"
          value={form.meaning}
          onChange={(e) => onChange("meaning", e.target.value)}
        />
        <Input
          label="Motto"
          placeholder="e.g. Love Never Fails"
          value={form.motto}
          onChange={(e) => onChange("motto", e.target.value)}
        />
      </div>

      {/* Scripture */}
      <Input
        label="Scripture Reference"
        placeholder="e.g. John 13:34"
        value={form.scripture}
        onChange={(e) => onChange("scripture", e.target.value)}
      />

      {/* Gender + Age Range + Allocation */}
      <div className="grid grid-cols-3 gap-3">
        <Select
          label="Gender"
          value={form.gender}
          onChange={(e) => onChange("gender", e.target.value)}
        >
          <option value="">Unspecified</option>
          <option value="MIXED">Mixed</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </Select>
        <Select
          label="Age Range"
          value={form.ageRange}
          onChange={(e) => onChange("ageRange", e.target.value)}
        >
          <option value="All Ages">All Ages</option>
          <option value="10-12">10–12</option>
          <option value="13-15">13–15</option>
          <option value="16-18">16–18</option>
        </Select>
        <Select
          label="Allocation"
          value={form.allocationStrategy}
          onChange={(e) => onChange("allocationStrategy", e.target.value)}
        >
          <option value="MANUAL">Manual</option>
          <option value="AUTOMATIC">Automatic</option>
          <option value="INVITE_ONLY">Invite Only</option>
        </Select>
      </div>

      {/* Display Order + Max Capacity */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Display Order"
          type="number"
          min="0"
          value={form.displayOrder}
          onChange={(e) => onChange("displayOrder", e.target.value)}
        />
        <Input
          label="Max Capacity"
          type="number"
          min="1"
          placeholder="Unlimited"
          value={form.maxCapacity}
          onChange={(e) => onChange("maxCapacity", e.target.value)}
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700">Description</label>
        <textarea
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
          rows={2}
          placeholder="Optional short description"
          value={form.description}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </div>
    </div>
  );
}

export function TribeGrid({
  organizationId,
  campId,
}: {
  organizationId: string;
  campId: string;
}) {
  const utils = api.useUtils();
  const { data: tribes = [], isLoading } = api.orgStructure.getTribeStructure.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId && !!campId }
  );

  const [selected, setSelected] = useState<any | null>(null);

  // Add / Edit dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editTribe, setEditTribe] = useState<any | null>(null);
  const [addForm, setAddForm] = useState<TribeFormData>(emptyForm());
  const [editForm, setEditForm] = useState<TribeFormData>(emptyForm());
  const [formError, setFormError] = useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const invalidate = () => utils.orgStructure.getTribeStructure.invalidate({ organizationId, campId });

  const createTribe = api.tribe.create.useMutation({
    onSuccess: () => { setAddOpen(false); setAddForm(emptyForm()); setFormError(""); invalidate(); },
    onError: (err) => setFormError(err.message),
  });

  const updateTribe = api.tribe.update.useMutation({
    onSuccess: () => { setEditTribe(null); setFormError(""); invalidate(); },
    onError: (err) => setFormError(err.message),
  });

  const deleteTribe = api.tribe.delete.useMutation({
    onSuccess: () => { setDeleteTarget(null); invalidate(); },
    onError: (err) => setFormError(err.message),
  });

  function patchForm(
    setter: React.Dispatch<React.SetStateAction<TribeFormData>>
  ) {
    return (k: keyof TribeFormData, v: string) => setter((f) => ({ ...f, [k]: v }));
  }

  function formToCreateInput(f: TribeFormData) {
    return {
      campId,
      name: f.name.trim(),
      code: f.code.trim() || undefined,
      color: f.color || undefined,
      displayOrder: f.displayOrder ? parseInt(f.displayOrder) : 0,
      description: f.description.trim() || undefined,
      meaning: f.meaning.trim() || undefined,
      motto: f.motto.trim() || undefined,
      scripture: f.scripture.trim() || undefined,
      gender: (f.gender || undefined) as "MALE" | "FEMALE" | "MIXED" | undefined,
      ageRange: f.ageRange.trim() || undefined,
      allocationStrategy: f.allocationStrategy as "MANUAL" | "AUTOMATIC" | "INVITE_ONLY",
      maxCapacity: f.maxCapacity ? parseInt(f.maxCapacity) : undefined,
    };
  }

  function formToUpdateData(f: TribeFormData) {
    return {
      name: f.name.trim(),
      code: f.code.trim() || null,
      color: f.color || null,
      displayOrder: f.displayOrder ? parseInt(f.displayOrder) : 0,
      description: f.description.trim() || null,
      meaning: f.meaning.trim() || null,
      motto: f.motto.trim() || null,
      scripture: f.scripture.trim() || null,
      gender: (f.gender || null) as "MALE" | "FEMALE" | "MIXED" | null,
      ageRange: f.ageRange.trim() || null,
      allocationStrategy: f.allocationStrategy as "MANUAL" | "AUTOMATIC" | "INVITE_ONLY",
      maxCapacity: f.maxCapacity ? parseInt(f.maxCapacity) : null,
    };
  }

  function openEdit(t: any) {
    setEditTribe(t);
    setEditForm({
      name: t.name ?? "",
      code: t.code ?? "",
      color: t.color ?? "#6D4C41",
      displayOrder: String(t.displayOrder ?? 0),
      description: t.description ?? "",
      meaning: t.meaning ?? "",
      motto: t.motto ?? "",
      scripture: t.scripture ?? "",
      gender: t.gender ?? "MIXED",
      ageRange: t.ageRange ?? "All Ages",
      allocationStrategy: t.allocationStrategy ?? "MANUAL",
      maxCapacity: t.maxCapacity ? String(t.maxCapacity) : "",
    });
    setFormError("");
  }

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Tribes</h2>
          {tribes.length > 0 && (
            <p className="text-sm text-neutral-500">{tribes.length} tribe{tribes.length !== 1 ? "s" : ""} in this camp</p>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => { setAddOpen(true); setAddForm(emptyForm()); setFormError(""); }}
        >
          + Add Tribe
        </Button>
      </div>

      {tribes.length === 0 ? (
        <EmptyState
          title="No tribes yet"
          description="Add your first tribe to start allocating campers and running competitions."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tribes.map((t: any) => (
            <Card
              key={t.id}
              className="group relative cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setSelected(t)}
            >
              {/* Tribe colour top stripe */}
              {t.color && (
                <div
                  className="h-1.5 w-full rounded-t-lg"
                  style={{ backgroundColor: t.color }}
                />
              )}
              <CardBody>
                {/* Title row */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {t.color && (
                      <span
                        className="h-5 w-5 flex-shrink-0 rounded-full border border-neutral-200 shadow-sm"
                        style={{ backgroundColor: t.color }}
                      />
                    )}
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-neutral-900">{t.name}</h3>
                      {t.code && <span className="text-xs font-mono text-neutral-400">{t.code}</span>}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Badge tone="info">{t.points} pts</Badge>
                  </div>
                </div>

                {/* Stats */}
                <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-500">
                  <div>Campers: <span className="font-medium text-neutral-700">{t.camperCount}</span></div>
                  {t.maxCapacity && (
                    <div>Capacity: <span className="font-medium text-neutral-700">{t.maxCapacity}</span></div>
                  )}
                  <div>Monitor: <span className="font-medium text-neutral-700">{t.monitor?.name ?? "—"}</span></div>
                  <div>Assistant: <span className="font-medium text-neutral-700">{t.assistantMonitor?.name ?? "—"}</span></div>
                  {t.hostels?.length > 0 && (
                    <div className="col-span-2">Hostel: <span className="font-medium text-neutral-700">{t.hostels.join(", ")}</span></div>
                  )}
                </div>

                {/* Meta badges */}
                <div className="mb-3 flex flex-wrap gap-1">
                  {t.gender && t.gender !== "MIXED" && (
                    <Badge tone="neutral">{t.gender}</Badge>
                  )}
                  {t.ageRange && t.ageRange !== "All Ages" && (
                    <Badge tone="neutral">{t.ageRange}</Badge>
                  )}
                  {t.allocationStrategy && t.allocationStrategy !== "MANUAL" && (
                    <Badge tone="warning">{t.allocationStrategy}</Badge>
                  )}
                  {t.status === "INACTIVE" && (
                    <Badge tone="danger">Inactive</Badge>
                  )}
                </div>

                {/* Motto / meaning */}
                {(t.meaning || t.motto) && (
                  <div className="border-t border-neutral-100 pt-2 text-xs text-neutral-500">
                    {t.meaning && <div className="italic">"{t.meaning}"</div>}
                    {t.motto && <div className="font-medium text-neutral-600">{t.motto}</div>}
                  </div>
                )}

                {/* Action buttons — appear on hover */}
                <div
                  className="mt-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEdit(t)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget({ id: t.id, name: t.name })}
                  >
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Selected tribe panel */}
      {selected && <TribeDashboardPanel tribe={selected} onClose={() => setSelected(null)} />}

      {/* ── Add Tribe Dialog ── */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add Tribe">
        <TribeFormFields form={addForm} onChange={patchForm(setAddForm)} />
        {formError && <p className="mt-2 text-sm text-danger-600">{formError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            disabled={!addForm.name.trim()}
            loading={createTribe.isPending}
            onClick={() => createTribe.mutate(formToCreateInput(addForm))}
          >
            Create Tribe
          </Button>
        </div>
      </Dialog>

      {/* ── Edit Tribe Dialog ── */}
      <Dialog open={!!editTribe} onClose={() => setEditTribe(null)} title={`Edit — ${editTribe?.name ?? ""}`}>
        <TribeFormFields form={editForm} onChange={patchForm(setEditForm)} />
        {formError && <p className="mt-2 text-sm text-danger-600">{formError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditTribe(null)}>Cancel</Button>
          <Button
            disabled={!editForm.name.trim()}
            loading={updateTribe.isPending}
            onClick={() => updateTribe.mutate({ id: editTribe.id, data: formToUpdateData(editForm) })}
          >
            Save Changes
          </Button>
        </div>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Tribe" size="sm">
        <p className="text-sm text-neutral-600">
          Are you sure you want to delete <strong>"{deleteTarget?.name}"</strong>? This action cannot be undone if campers are assigned.
        </p>
        {formError && <p className="mt-2 text-sm text-danger-600">{formError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteTribe.isPending}
            onClick={() => deleteTarget && deleteTribe.mutate({ id: deleteTarget.id })}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
