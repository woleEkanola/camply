"use client";

import { useState, useCallback } from "react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { DraggableFieldList } from "./DraggableFieldList";
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
  { value: "PHONE", label: "Nigerian Phone Number" },
];

const HAS_OPTIONS: FormFieldType[] = ["SELECT", "MULTI_SELECT", "RADIO"];

// systemKeys whose options are populated live from the database (see formField.ts's `list`) —
// not editable as free-text CSV.
const DYNAMIC_OPTION_KEYS: Record<string, string> = {
  preferredCampusId: "Automatically populated from your Campuses.",
  homeCampusId: "Automatically populated from your Campuses.",
  departmentId: "Automatically populated from your Departments — only ones with available capacity are shown to applicants.",
};

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const create = api.formField.create.useMutation({ onSuccess: () => { setEdit(null); invalidate(); }, onError: (e) => setError(e.message) });
  const remove = api.formField.remove.useMutation({ onSuccess: () => { setSelectedIds(new Set()); invalidate(); }, onError: (e) => setError(e.message) });
  const removeMany = api.formField.removeMany.useMutation({
    onSuccess: (result) => {
      setError(`Deleted ${result.deleted} field(s).${result.skipped > 0 ? ` Skipped ${result.skipped} (system or in-use).` : ""}`);
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const reorder = api.formField.reorder.useMutation({ onSuccess: invalidate });

  const [optimisticVisible, setOptimisticVisible] = useState<Record<string, boolean>>({});
  const [optimisticRequired, setOptimisticRequired] = useState<Record<string, boolean>>({});

  const updateVisible = api.formField.update.useMutation({ onSuccess: invalidate });
  const updateRequired = api.formField.update.useMutation({ onSuccess: invalidate });
  const update = api.formField.update.useMutation({ onSuccess: () => { setEdit(null); invalidate(); }, onError: (e) => setError(e.message) });

  const toggleVisible = useCallback((id: string, checked: boolean) => {
    setOptimisticVisible((prev) => ({ ...prev, [id]: checked }));
    updateVisible.mutate({ id, visible: checked }, {
      onError: () => setOptimisticVisible((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      }),
    });
  }, [updateVisible]);

  const toggleRequired = useCallback((id: string, checked: boolean) => {
    setOptimisticRequired((prev) => ({ ...prev, [id]: checked }));
    updateRequired.mutate({ id, required: checked }, {
      onError: () => setOptimisticRequired((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      }),
    });
  }, [updateRequired]);

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
      options: parseFieldOptions(field.options).map((o) => (typeof o === "string" ? o : o.label)).join(", "),
      helpText: field.helpText ?? "",
      placeholder: field.placeholder ?? "",
      groupLabel: field.groupLabel ?? "",
    });
    setEdit({ mode: "edit", field });
  }

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function handleSelectAll() {
    const customIds = fields.filter((f) => f.source === "CUSTOM").map((f) => f.id);
    if (selectedIds.size === customIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customIds));
    }
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    removeMany.mutate({ ids: Array.from(selectedIds) });
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
  const dynamicOptionsCaption = edit?.field?.systemKey ? DYNAMIC_OPTION_KEYS[edit.field.systemKey] : undefined;

  const customFields = fields.filter((f) => f.source === "CUSTOM");
  const allCustomSelected = customFields.length > 0 && selectedIds.size === customFields.length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-neutral-500">Fields shown to the wizard, in order. Drag to reorder. System fields can be hidden or required but not removed.</p>
        <Button size="sm" className="whitespace-nowrap px-3" onClick={openCreate}>Add Custom Field</Button>
      </div>

      {error && !edit && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-accent-200 bg-accent-50 px-4 py-2">
          <span className="text-sm font-medium text-accent-800">{selectedIds.size} field(s) selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={handleSelectAll}>
            {allCustomSelected ? "Deselect All" : `Select All (${customFields.length})`}
          </Button>
          <Button size="sm" variant="danger" onClick={handleBulkDelete} loading={removeMany.isPending}>
            Delete Selected
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-neutral-100" />
          ))}
        </div>
      ) : fields.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white py-12 text-center">
          <p className="text-sm font-medium text-neutral-700">No fields yet</p>
          <p className="mt-1 text-xs text-neutral-500">Click "Add Custom Field" to create your first field.</p>
        </div>
      ) : (
        <DraggableFieldList
          fields={fields}
          optimisticVisible={optimisticVisible}
          optimisticRequired={optimisticRequired}
          selectedIds={selectedIds}
          allCustomSelected={allCustomSelected}
          onToggleVisible={toggleVisible}
          onToggleRequired={toggleRequired}
          onEdit={openEdit}
          onDelete={(id) => remove.mutate({ id })}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onReorder={(orderedIds) => reorder.mutate({ organizationId, audience, orderedIds })}
        />
      )}

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
              disabled={!!dynamicOptionsCaption}
              helpText={dynamicOptionsCaption}
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
