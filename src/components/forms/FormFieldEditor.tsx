"use client";

import { useState } from "react";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { parseFieldOptions, stringifyFieldOptions } from "@/lib/formFieldOptions";
import type { FormFieldDTO, FormFieldType, FormFieldAudience } from "./types";

const ALL_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "LONG_TEXT", label: "Long Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Yes/No Toggle" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "SELECT", label: "Dropdown" },
  { value: "MULTI_SELECT", label: "Multi-select" },
  { value: "RADIO", label: "Radio Buttons" },
  { value: "FILE", label: "File Upload" },
];

const HAS_OPTIONS: FormFieldType[] = ["SELECT", "MULTI_SELECT", "RADIO"];

interface FormFieldEditorProps {
  organizationId: string;
  audience: FormFieldAudience;
}

interface EditState {
  mode: "create" | "edit";
  field?: FormFieldDTO;
}

export function FormFieldEditor({ organizationId, audience }: FormFieldEditorProps) {
  const utils = api.useUtils();
  const { data: fields = [], isLoading } = api.formField.list.useQuery(
    { organizationId, audience },
    { enabled: !!organizationId }
  );

  const invalidate = () => utils.formField.list.invalidate({ organizationId, audience });

  const [error, setError] = useState("");
  const create = api.formField.create.useMutation({ onSuccess: () => { setEdit(null); invalidate(); }, onError: (e) => setError(e.message) });
  const update = api.formField.update.useMutation({ onSuccess: () => { setEdit(null); invalidate(); }, onError: (e) => setError(e.message) });
  const remove = api.formField.remove.useMutation({ onSuccess: invalidate, onError: (e) => setError(e.message) });
  const reorder = api.formField.reorder.useMutation({ onSuccess: invalidate });

  const [edit, setEdit] = useState<EditState | null>(null);
  const [form, setForm] = useState({
    name: "", label: "", type: "TEXT" as FormFieldType, required: false, visible: true,
    options: "", helpText: "", placeholder: "", groupLabel: "",
  });

  function openCreate() {
    setError("");
    setForm({ name: "", label: "", type: "TEXT", required: false, visible: true, options: "", helpText: "", placeholder: "", groupLabel: "" });
    setEdit({ mode: "create" });
  }

  function openEdit(field: FormFieldDTO) {
    setError("");
    setForm({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      visible: field.visible,
      options: parseFieldOptions(field.options).join(", "),
      helpText: field.helpText ?? "",
      placeholder: field.placeholder ?? "",
      groupLabel: field.groupLabel ?? "",
    });
    setEdit({ mode: "edit", field });
  }

  function moveField(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    const reordered = [...fields];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    reorder.mutate({ organizationId, audience, orderedIds: reordered.map((f: FormFieldDTO) => f.id) });
  }

  function handleSave() {
    setError("");
    const optionsValue = HAS_OPTIONS.includes(form.type) && form.options.trim()
      ? stringifyFieldOptions(form.options.split(",").map((o) => o.trim()))
      : undefined;

    if (edit?.mode === "create") {
      create.mutate({
        organizationId,
        audience,
        name: form.name.trim(),
        label: form.label.trim(),
        type: form.type,
        required: form.required,
        options: optionsValue,
        helpText: form.helpText.trim() || undefined,
        placeholder: form.placeholder.trim() || undefined,
        groupLabel: form.groupLabel.trim() || undefined,
      });
    } else if (edit?.field) {
      update.mutate({
        id: edit.field.id,
        label: form.label.trim(),
        required: form.required,
        visible: form.visible,
        options: optionsValue ?? null,
        helpText: form.helpText.trim() || null,
        placeholder: form.placeholder.trim() || null,
        groupLabel: form.groupLabel.trim() || null,
      });
    }
  }

  const showOptionsEditor = HAS_OPTIONS.includes(form.type);
  const isSystemEdit = edit?.mode === "edit" && edit.field?.source === "SYSTEM";

  const columns: Column<FormFieldDTO>[] = [
    {
      header: "Field",
      accessor: (f) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900">{f.label}</span>
            <Badge tone="neutral">{f.type}</Badge>
            {f.source === "SYSTEM" && <Badge tone="info">System</Badge>}
          </div>
          {f.groupLabel && <div className="text-xs text-neutral-500">{f.groupLabel}</div>}
        </div>
      ),
    },
    {
      header: "Required",
      accessor: (f) => (
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.required}
            onChange={(e) => update.mutate({ id: f.id, required: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
          />
        </label>
      ),
    },
    {
      header: "Visible",
      accessor: (f) => (
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.visible}
            onChange={(e) => update.mutate({ id: f.id, visible: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
          />
        </label>
      ),
    },
    {
      header: "Order",
      accessor: (f) => {
        const index = fields.findIndex((x: FormFieldDTO) => x.id === f.id);
        return (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => moveField(index, -1)}
              disabled={index === 0}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30"
              aria-label="Move up"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveField(index, 1)}
              disabled={index === fields.length - 1}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30"
              aria-label="Move down"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-500">Fields shown to the wizard, in order. System fields can be hidden or required but not removed.</p>
        <Button size="sm" onClick={openCreate}>Add Custom Field</Button>
      </div>

      {error && !edit && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}

      <Table
        columns={columns}
        data={fields}
        rowKey={(f: FormFieldDTO) => f.id}
        isLoading={isLoading}
        emptyTitle="No fields yet"
        actions={(f: FormFieldDTO) => (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => openEdit(f)}>Edit</Button>
            {f.source === "CUSTOM" && (
              <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: f.id })}>Delete</Button>
            )}
          </div>
        )}
      />

      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.mode === "create" ? "Add Custom Field" : `Edit ${edit?.field?.label ?? "Field"}`}
      >
        <div className="space-y-3">
          {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}

          {edit?.mode === "create" && (
            <Input label="Name (internal key)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          )}
          <Input label="Label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />

          {edit?.mode === "create" ? (
            <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FormFieldType }))}>
              {ALL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          ) : (
            <div className="text-sm text-neutral-500">Type: <span className="font-medium text-neutral-700">{edit?.field?.type}</span></div>
          )}

          {(edit?.mode === "create" ? showOptionsEditor : isSystemEdit ? HAS_OPTIONS.includes(edit?.field?.type as FormFieldType) : showOptionsEditor) && (
            <Input
              label="Options (comma separated)"
              value={form.options}
              onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
              placeholder="e.g. Option 1, Option 2, Option 3"
            />
          )}

          <Input label="Section" value={form.groupLabel} onChange={(e) => setForm((f) => ({ ...f, groupLabel: e.target.value }))} helpText="Groups this field with others under the same section heading in the wizard." />

          {edit?.mode === "create" && (
            <>
              <Input label="Help Text" value={form.helpText} onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))} />
              <Input label="Placeholder" value={form.placeholder} onChange={(e) => setForm((f) => ({ ...f, placeholder: e.target.value }))} />
            </>
          )}

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.required} onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))} className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500" />
              Required
            </label>
            {edit?.mode === "edit" && (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={form.visible} onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))} className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500" />
                Visible
              </label>
            )}
          </div>

          <Button className="w-full" onClick={handleSave} loading={create.isPending || update.isPending} disabled={!form.label.trim() || (edit?.mode === "create" && !form.name.trim())}>
            {edit?.mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
