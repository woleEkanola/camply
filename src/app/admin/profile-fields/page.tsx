"use client";

import React, { useState } from "react";
import { api } from "@/utils/trpc";
import { useSession } from "next-auth/react";
import SimpleAdminLayout from "../components/SimpleAdminLayout";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

export default function ProfileFieldsPage() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId;
  const isAdmin =
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "OWNER" ||
    session?.user?.role === "SUPER_ADMIN";

  // Fetch all fields for this org
  const { data: fields = [], isLoading, refetch } = api.profileField.getByOrganization.useQuery({ organizationId }, { enabled: !!organizationId });

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

  return (
    <SimpleAdminLayout activeTab="profile-fields">
      <div className="max-w-2xl mx-auto py-8">
        <h2 className="text-2xl font-bold mb-6">Manage Profile Fields</h2>

        <form
          className="bg-white rounded shadow p-4 mb-8 space-y-4"
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
          <div>
            <label className="block font-medium">Field Name</label>
            <input
              className="border rounded px-2 py-1 w-full"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block font-medium">Field Label</label>
            <input
              className="border rounded px-2 py-1 w-full"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block font-medium">Field Type</label>
            <select
              className="border rounded px-2 py-1 w-full"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            >
              {FIELD_TYPES.map(ft => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </div>
          {form.type === "dropdown" && (
            <div>
              <label className="block font-medium">Dropdown Options (comma separated)</label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={form.options}
                onChange={e => setForm(f => ({ ...f, options: e.target.value }))}
                placeholder="e.g. Option 1, Option 2, Option 3"
                required={form.type === "dropdown"}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.required}
              onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
              id="required"
            />
            <label htmlFor="required">Required</label>
          </div>
          {error && <div className="text-red-600">{error}</div>}
          {success && <div className="text-green-600">{success}</div>}
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            disabled={createField.isLoading}
          >
            {createField.isLoading ? "Creating..." : "Add Field"}
          </button>
        </form>

        <h3 className="text-xl font-semibold mb-3">Current Fields</h3>
        {isLoading ? (
          <div>Loading...</div>
        ) : fields.length === 0 ? (
          <div>No custom fields yet.</div>
        ) : (
          <table className="min-w-full bg-white border rounded">
            <thead>
              <tr>
                <th className="px-4 py-2 border-b">Name</th>
                <th className="px-4 py-2 border-b">Type</th>
                <th className="px-4 py-2 border-b">Required</th>
                <th className="px-4 py-2 border-b">Options</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field: any) => (
                <tr key={field.id}>
                  <td className="px-4 py-2 border-b">{field.name}</td>
                  <td className="px-4 py-2 border-b">{field.type}</td>
                  <td className="px-4 py-2 border-b">{field.required ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 border-b">{Array.isArray(field.options) ? field.options.join(", ") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SimpleAdminLayout>
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
