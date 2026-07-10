"use client";

import React, { useState } from "react";
import { api } from "@/utils/trpc";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { StaffFieldsTab } from "@/components/staff/StaffFieldsTab";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

export default function ProfileFieldsPage() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId ?? "";
  const isAdmin =
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "OWNER" ||
    session?.user?.role === "SUPER_ADMIN";

  // Fetch all fields for this org
  const { data: fields = [], isLoading, refetch } = api.profileField.getByOrganization.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // State for new field form
  const [form, setForm] = useState({
    name: "",
    label: "",
    type: "text",
    required: false,
    options: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const createField = api.profileField.create.useMutation({
    onSuccess: () => {
      setSuccess("Field created!");
      setForm({ name: "", label: "", type: "text", required: false, options: "" });
      refetch();
    },
    onError: err => setError(err.message),
  });

  if (!isAdmin) {
    return <div className="p-8 text-red-600">You do not have permission to manage profile fields.</div>;
  }

  const campersTab = (
    <div>
        <Card className="mb-8">
        <CardBody>
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            setError("");
            setSuccess("");
            if (!form.name.trim()) return setError("Field name is required");
            if (!form.label.trim()) return setError("Field label is required");
            if (form.type === "dropdown" && !form.options.trim()) return setError("Dropdown options required");
            let optionsValue = form.options;
            // Always store as JSON array
            if (form.type === "dropdown") {
              const arr = form.options
                .split(',')
                .map(opt => opt.trim())
                .filter(Boolean);
              optionsValue = JSON.stringify(arr);
            }
            createField.mutate({
              name: form.name.trim(),
              label: form.label.trim(),
              type: mapFieldType(form.type),
              required: form.required,
              options: form.type === "dropdown" ? optionsValue : undefined,
              organizationId,
            });
          }}
        >
          <Input label="Field Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <Input label="Field Label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required />
          <Select label="Field Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            {FIELD_TYPES.map(ft => (
              <option key={ft.value} value={ft.value}>{ft.label}</option>
            ))}
          </Select>
          {form.type === "dropdown" && (
            <Input
              label="Dropdown Options (comma separated)"
              value={form.options}
              onChange={e => setForm(f => ({ ...f, options: e.target.value }))}
              placeholder="e.g. Option 1, Option 2, Option 3"
              required={form.type === "dropdown"}
            />
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={form.required}
              onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
              className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
            />
            Required
          </label>
          {error && <div className="text-sm text-danger-600">{error}</div>}
          {success && <div className="text-sm text-success-600">{success}</div>}
          <Button type="submit" loading={createField.status === "pending"}>Add Field</Button>
        </form>
        </CardBody>
        </Card>

        <h3 className="mb-3 text-sm font-semibold text-neutral-900">Current Fields</h3>
        <Table
          columns={[
            { header: "Name", accessor: "name" },
            { header: "Type", accessor: "type" },
            { header: "Required", accessor: (field: any) => <Badge tone={field.required ? "attention" : "neutral"}>{field.required ? "Yes" : "No"}</Badge> },
            { header: "Options", accessor: (field: any) => Array.isArray(field.options) ? field.options.join(", ") : "-" },
          ] as Column<any>[]}
          data={fields}
          rowKey={(field: any) => field.id}
          isLoading={isLoading}
          emptyTitle="No custom fields yet"
        />
    </div>
  );

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Profile Fields" description="Custom fields collected during registration." />
        <Tabs
          tabs={[
            { label: "Campers", content: campersTab },
            { label: "Teachers", content: <StaffFieldsTab organizationId={organizationId} audience="TEACHER" /> },
            { label: "Volunteers", content: <StaffFieldsTab organizationId={organizationId} audience="VOLUNTEER" /> },
          ]}
        />
      </div>
    </AppShell>
  );
}

function mapFieldType(type: string) {
  switch (type) {
    case "text": return "TEXT";
    case "number": return "NUMBER";
    case "date": return "DATE";
    case "dropdown": return "SELECT";
    case "checkbox": return "BOOLEAN";
    default: return "TEXT";
  }
}
