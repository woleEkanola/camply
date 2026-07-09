"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { api } from "../../../../../utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

export default function CampConfigPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  const utils = api.useUtils();
  const { data: year, isLoading } = api.year.getById.useQuery({ id }, { enabled: !!id });
  const { data: readiness, refetch: refetchReadiness } = api.year.readiness.useQuery({ id }, { enabled: !!id });
  const { data: requirements, refetch: refetchRequirements } = api.documentRequirement.listByYear.useQuery(
    { yearId: id },
    { enabled: !!id }
  );

  const updateConfig = api.year.updateCampConfig.useMutation({
    onSuccess: () => {
      utils.year.getById.invalidate({ id });
      refetchReadiness();
      setSuccess("Camp configuration saved.");
      setError("");
    },
    onError: (e) => setError(e.message),
  });

  const createRequirement = api.documentRequirement.create.useMutation({
    onSuccess: () => {
      refetchRequirements();
      refetchReadiness();
      setNewReq({ name: "", description: "", required: true, scope: "CAMPER" });
    },
  });
  const deleteRequirement = api.documentRequirement.delete.useMutation({
    onSuccess: () => {
      refetchRequirements();
      refetchReadiness();
    },
  });
  const toggleRequirement = api.documentRequirement.update.useMutation({
    onSuccess: () => refetchRequirements(),
  });

  const [form, setForm] = useState({
    theme: "",
    description: "",
    registrationOpensAt: "",
    registrationClosesAt: "",
    arrivalDate: "",
    departureDate: "",
    minAge: "",
    maxAge: "",
    ageCutoffDate: "",
    maxRegistrations: "",
    capacityBehavior: "CLOSE" as "CLOSE" | "WAITLIST" | "PENDING_OK",
    approvalMode: "MANUAL" as "MANUAL" | "AUTO",
    allowResubmission: true,
    status: "DRAFT" as "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED",
    orgCode: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newReq, setNewReq] = useState({ name: "", description: "", required: true, scope: "CAMPER" as "CAMPER" | "REGISTRATION" });

  useEffect(() => {
    if (!year) return;
    setForm({
      theme: year.theme ?? "",
      description: year.description ?? "",
      registrationOpensAt: toDateInputValue(year.registrationOpensAt),
      registrationClosesAt: toDateInputValue(year.registrationClosesAt),
      arrivalDate: toDateInputValue(year.arrivalDate),
      departureDate: toDateInputValue(year.departureDate),
      minAge: year.minAge?.toString() ?? "",
      maxAge: year.maxAge?.toString() ?? "",
      ageCutoffDate: toDateInputValue(year.ageCutoffDate),
      maxRegistrations: year.maxRegistrations?.toString() ?? "",
      capacityBehavior: (year.capacityBehavior as any) ?? "CLOSE",
      approvalMode: (year.approvalMode as any) ?? "MANUAL",
      allowResubmission: year.allowResubmission ?? true,
      status: (year.status as any) ?? "DRAFT",
      orgCode: year.orgCode ?? "",
    });
  }, [year]);

  if (isLoading || !year) {
    return (
      <AppShell area="admin">
        <div className="p-8">Loading...</div>
      </AppShell>
    );
  }

  const handleSave = () => {
    updateConfig.mutate({
      id,
      data: {
        theme: form.theme || null,
        description: form.description || null,
        registrationOpensAt: form.registrationOpensAt ? new Date(form.registrationOpensAt) : null,
        registrationClosesAt: form.registrationClosesAt ? new Date(form.registrationClosesAt) : null,
        arrivalDate: form.arrivalDate ? new Date(form.arrivalDate) : null,
        departureDate: form.departureDate ? new Date(form.departureDate) : null,
        minAge: form.minAge ? Number(form.minAge) : null,
        maxAge: form.maxAge ? Number(form.maxAge) : null,
        ageCutoffDate: form.ageCutoffDate ? new Date(form.ageCutoffDate) : null,
        maxRegistrations: form.maxRegistrations ? Number(form.maxRegistrations) : null,
        capacityBehavior: form.capacityBehavior,
        approvalMode: form.approvalMode,
        allowResubmission: form.allowResubmission,
        status: form.status,
        orgCode: form.orgCode || null,
      },
    });
  };

  const checklistLabels: Record<string, string> = {
    registrationDatesConfigured: "Registration Dates Configured",
    campDatesConfigured: "Camp Dates Configured",
    ageRulesConfigured: "Age Rules Configured",
    atLeastOneCentre: "At Least One Centre Exists",
    capacityDefined: "Capacity Defined",
    registrationLinkGenerated: "Registration Link Generated",
    requiredDocumentsConfigured: "Required Documents Configured",
  };

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title={`Configure Camp: ${year.name}`}
          description="Set registration rules, dates, and requirements before opening registration."
          actions={<Button variant="secondary" size="sm" onClick={() => router.push(`/admin/years/${id}/tribes`)}>Manage Tribes →</Button>}
        />

        {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        {success && <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">{success}</div>}

        {/* Readiness checklist */}
        {readiness && (
          <Card>
            <CardHeader>
              <CardTitle>
                Registration Readiness: <Badge tone={readiness.ready ? "success" : "warning"}>{readiness.ready ? "Ready" : "Not Ready"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {Object.entries(readiness.checklist).map(([key, value]) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <span>{value ? "✅" : "⬜"}</span>
                    <span>{checklistLabels[key] ?? key}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {/* Basic + schedule */}
        <Card>
          <CardHeader><CardTitle>Camp Settings</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Theme" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
              <Input label="Organization Code (for registration numbers)" value={form.orgCode} onChange={(e) => setForm({ ...form, orgCode: e.target.value })} />
              <Textarea containerClassName="md:col-span-2" label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

              <Input label="Registration Opens" type="date" value={form.registrationOpensAt} onChange={(e) => setForm({ ...form, registrationOpensAt: e.target.value })} />
              <Input label="Registration Closes" type="date" value={form.registrationClosesAt} onChange={(e) => setForm({ ...form, registrationClosesAt: e.target.value })} />
              <Input label="Arrival Date" type="date" value={form.arrivalDate} onChange={(e) => setForm({ ...form, arrivalDate: e.target.value })} />
              <Input label="Departure Date" type="date" value={form.departureDate} onChange={(e) => setForm({ ...form, departureDate: e.target.value })} />

              <Input label="Minimum Age" type="number" value={form.minAge} onChange={(e) => setForm({ ...form, minAge: e.target.value })} />
              <Input label="Maximum Age" type="number" value={form.maxAge} onChange={(e) => setForm({ ...form, maxAge: e.target.value })} />
              <Input
                containerClassName="md:col-span-2"
                label="Age Cutoff Date"
                type="date"
                value={form.ageCutoffDate}
                onChange={(e) => setForm({ ...form, ageCutoffDate: e.target.value })}
                helpText="Age is calculated as of this date, not today's date."
              />

              <Input label="Max Registrations (blank = unlimited)" type="number" value={form.maxRegistrations} onChange={(e) => setForm({ ...form, maxRegistrations: e.target.value })} />
              <Select label="When Capacity Reached" value={form.capacityBehavior} onChange={(e) => setForm({ ...form, capacityBehavior: e.target.value as any })}>
                <option value="CLOSE">Close Registration</option>
                <option value="WAITLIST">Enable Waitlist</option>
                <option value="PENDING_OK">Continue Accepting Pending</option>
              </Select>

              <Select label="Approval Workflow" value={form.approvalMode} onChange={(e) => setForm({ ...form, approvalMode: e.target.value as any })}>
                <option value="MANUAL">Manual Approval</option>
                <option value="AUTO">Automatic Approval</option>
              </Select>
              <Select label="Camp Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="CLOSED">Closed</option>
                <option value="ARCHIVED">Archived</option>
              </Select>

              <label className="flex items-center gap-2 text-sm text-neutral-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.allowResubmission}
                  onChange={(e) => setForm({ ...form, allowResubmission: e.target.checked })}
                  className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                />
                Allow parents to resubmit after a rejection
              </label>
            </div>

            <Button loading={updateConfig.isPending} onClick={handleSave}>Save Camp Settings</Button>
          </CardBody>
        </Card>

        {/* Document requirements */}
        <Card>
          <CardHeader><CardTitle>Required Documents</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <div className="space-y-2">
              {requirements?.map((req) => (
                <div key={req.id} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
                  <div>
                    <div className="font-medium text-neutral-900">{req.name} {req.required && <Badge tone="danger" className="ml-1">required</Badge>}</div>
                    <div className="text-xs text-neutral-500">{req.scope === "CAMPER" ? "Reusable across camps" : "Specific to this camp"} · {req.description}</div>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <button className="text-accent-700 hover:underline" onClick={() => toggleRequirement.mutate({ id: req.id, data: { required: !req.required } })}>
                      {req.required ? "Make Optional" : "Make Required"}
                    </button>
                    <button className="text-danger-600 hover:underline" onClick={() => deleteRequirement.mutate({ id: req.id })}>Remove</button>
                  </div>
                </div>
              ))}
              {requirements?.length === 0 && <p className="text-sm text-neutral-500">No document requirements yet.</p>}
            </div>

            <div className="grid grid-cols-1 items-end gap-2 border-t border-neutral-200 pt-4 md:grid-cols-4">
              <Input
                containerClassName="md:col-span-2"
                label="Document Name"
                value={newReq.name}
                onChange={(e) => setNewReq({ ...newReq, name: e.target.value })}
                placeholder="e.g. Birth Certificate"
              />
              <Select label="Scope" value={newReq.scope} onChange={(e) => setNewReq({ ...newReq, scope: e.target.value as any })}>
                <option value="CAMPER">Camper (reusable)</option>
                <option value="REGISTRATION">Registration (per camp)</option>
              </Select>
              <Button disabled={!newReq.name} loading={createRequirement.isPending} onClick={() => createRequirement.mutate({ yearId: id, ...newReq })}>
                Add
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
