"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";

const FIELD_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "SELECT", label: "Dropdown" },
  { value: "BOOLEAN", label: "Checkbox" },
];

export function StaffFieldsTab({ organizationId, audience }: { organizationId: string; audience: "TEACHER" | "VOLUNTEER" }) {
  const utils = api.useUtils();
  const { data: fields = [], isLoading } = api.staff.listFields.useQuery({ organizationId, audience }, { enabled: !!organizationId });

  const [form, setForm] = useState({ name: "", label: "", type: "TEXT", required: false, options: "" });
  const [error, setError] = useState("");

  const invalidate = () => utils.staff.listFields.invalidate({ organizationId, audience });
  const createField = api.staff.createField.useMutation({
    onSuccess: () => {
      setForm({ name: "", label: "", type: "TEXT", required: false, options: "" });
      invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const deleteField = api.staff.deleteField.useMutation({ onSuccess: invalidate });

  return (
    <div>
      <Card className="mb-6">
        <CardBody>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              if (!form.name.trim() || !form.label.trim()) {
                setError("Name and label are required");
                return;
              }
              createField.mutate({
                organizationId,
                audience,
                name: form.name.trim(),
                label: form.label.trim(),
                type: form.type as any,
                required: form.required,
                options: form.type === "SELECT" ? form.options : undefined,
              });
            }}
          >
            <Input label="Field Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            <Input label="Field Label" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
            <Select label="Field Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            {form.type === "SELECT" && (
              <Input label="Options (comma separated)" value={form.options} onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} />
            )}
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={form.required} onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))} className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500" />
              Required
            </label>
            {error && <div className="text-sm text-danger-600">{error}</div>}
            <Button type="submit" loading={createField.isPending}>Add Question</Button>
          </form>
        </CardBody>
      </Card>

      <Table
        columns={[
          { header: "Label", accessor: "label" },
          { header: "Type", accessor: "type" },
          { header: "Required", accessor: (f: any) => <Badge tone={f.required ? "attention" : "neutral"}>{f.required ? "Yes" : "No"}</Badge> },
        ] as Column<any>[]}
        data={fields}
        rowKey={(f: any) => f.id}
        isLoading={isLoading}
        emptyTitle={`No ${audience === "TEACHER" ? "teacher" : "volunteer"} questions yet`}
        actions={(f: any) => (
          <button className="text-xs text-danger-600 hover:underline" onClick={() => deleteField.mutate({ id: f.id })}>Delete</button>
        )}
      />
    </div>
  );
}
