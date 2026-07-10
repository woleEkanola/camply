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
import { Tabs } from "@/components/ui/Tabs";

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

const CRITERIA: { key: string; label: string }[] = [
  { key: "SIBLINGS_TOGETHER", label: "Keep Siblings Together" },
  { key: "SIBLINGS_APART", label: "Separate Siblings" },
  { key: "GENDER", label: "Balance by Gender" },
  { key: "AGE", label: "Balance by Age Group" },
  { key: "CENTRE", label: "Balance by Camp Centre" },
  { key: "CHURCH", label: "Balance by Church" },
  { key: "SCHOOL", label: "Balance by School" },
  { key: "POPULATION", label: "Balance by Population" },
];

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

  // Tribes Queries
  const { data: tribes, refetch: refetchTribes } = api.tribe.listByYear.useQuery({ yearId: id }, { enabled: !!id });

  // Camp Configuration Mutations
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

  // Tribes Mutations
  const saveTribeConfig = api.tribe.updateAllocationConfig.useMutation({
    onSuccess: () => {
      utils.year.getById.invalidate({ id });
      setSuccess("Tribe allocation settings saved.");
      setError("");
    },
    onError: (e) => setError(e.message),
  });

  const createTribe = api.tribe.create.useMutation({
    onSuccess: () => {
      refetchTribes();
      setNewTribe({ name: "", color: "#E67E22", maxCapacity: "" });
    },
  });
  const updateTribe = api.tribe.update.useMutation({ onSuccess: () => refetchTribes() });
  const deleteTribe = api.tribe.delete.useMutation({ onSuccess: () => refetchTribes() });
  const bulkAssign = api.tribe.bulkAutoAssign.useMutation({
    onSuccess: (results) => {
      const ok = results.filter((r) => r.tribeId).length;
      setBulkResult(`Assigned ${ok} of ${results.length} campers.`);
      refetchTribes();
    },
  });

  // Camp Config Form States
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

  // Tribes States
  const [tribeEnabled, setTribeEnabled] = useState(false);
  const [tribeMode, setTribeMode] = useState<"MANUAL" | "AUTOMATIC" | "HYBRID">("MANUAL");
  const [tribeRules, setRules] = useState<{ criterion: string; enabled: boolean }[]>(
    CRITERIA.map((c) => ({ criterion: c.key, enabled: false }))
  );
  const [newTribe, setNewTribe] = useState({ name: "", color: "#E67E22", maxCapacity: "" });
  const [bulkResult, setBulkResult] = useState("");

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

    // Populate tribes configuration
    setTribeEnabled((year as any).tribeAllocationEnabled ?? false);
    setTribeMode((year as any).tribeAllocationMode ?? "MANUAL");
    const existingRules = (year as any).tribeAllocationRules;
    if (Array.isArray(existingRules) && existingRules.length > 0) {
      setRules(CRITERIA.map((c) => ({ criterion: c.key, enabled: !!existingRules.find((r: any) => r.criterion === c.key)?.enabled })));
    }
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

  // Tab 1: Camp Settings & Readiness
  const tab1Content = (
    <div className="space-y-6">
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
    </div>
  );

  // Tab 2: Required Documents
  const tab2Content = (
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
  );

  // Tab 3: Manage Tribes
  const tab3Content = (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Allocation Settings</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={tribeEnabled}
              onChange={(e) => setTribeEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
            />
            Enable tribe allocation for this camp
          </label>

          {tribeEnabled && (
            <>
              <Select label="Allocation Mode" containerClassName="max-w-sm" value={tribeMode} onChange={(e) => setTribeMode(e.target.value as any)}>
                <option value="MANUAL">Manual — admin picks the tribe</option>
                <option value="AUTOMATIC">Automatic — assigned on approval</option>
                <option value="HYBRID">Hybrid — suggested, admin confirms</option>
              </Select>

              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700">Allocation Criteria (priority = order below)</label>
                <div className="space-y-1">
                  {CRITERIA.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={!!tribeRules.find((r) => r.criterion === c.key)?.enabled}
                        onChange={(e) =>
                          setRules((prev) => prev.map((r) => (r.criterion === c.key ? { ...r, enabled: e.target.checked } : r)))
                        }
                        className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <Button
            loading={saveTribeConfig.isPending}
            onClick={() => saveTribeConfig.mutate({ yearId: id, tribeAllocationEnabled: tribeEnabled, tribeAllocationMode: tribeMode, tribeAllocationRules: tribeRules })}
          >
            Save Allocation Settings
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tribes</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <div className="space-y-2">
            {(tribes ?? []).map((tribe: any) => (
              <div key={tribe.id} className="flex items-center justify-between rounded-md border border-neutral-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tribe.color || "#999" }} />
                  <span className="font-medium text-neutral-900">{tribe.name}</span>
                  <span className="text-xs text-neutral-500">
                    {tribe.population} camper{tribe.population === 1 ? "" : "s"}
                    {tribe.maxCapacity ? ` / ${tribe.maxCapacity}` : ""}
                  </span>
                  {tribe.status === "INACTIVE" && <Badge tone="danger">Inactive</Badge>}
                </div>
                <div className="flex gap-3 text-sm">
                  <button
                    className="text-accent-700 hover:underline"
                    onClick={() => updateTribe.mutate({ id: tribe.id, data: { status: tribe.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } })}
                  >
                    {tribe.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                  <button className="text-danger-600 hover:underline" onClick={() => deleteTribe.mutate({ id: tribe.id })}>Delete</button>
                </div>
              </div>
            ))}
            {(tribes ?? []).length === 0 && <p className="text-sm text-neutral-500">No tribes created yet.</p>}
          </div>

          <div className="grid grid-cols-4 items-end gap-2 border-t border-neutral-200 pt-4">
            <Input containerClassName="col-span-2" label="Tribe Name" value={newTribe.name} onChange={(e) => setNewTribe({ ...newTribe, name: e.target.value })} placeholder="e.g. Green House" />
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Color</label>
              <input type="color" className="h-10 w-full rounded-md border border-neutral-300" value={newTribe.color} onChange={(e) => setNewTribe({ ...newTribe, color: e.target.value })} />
            </div>
            <Input label="Max Capacity" type="number" value={newTribe.maxCapacity} onChange={(e) => setNewTribe({ ...newTribe, maxCapacity: e.target.value })} />
            <Button
              className="col-span-4"
              disabled={!newTribe.name}
              loading={createTribe.isPending}
              onClick={() =>
                createTribe.mutate({
                  yearId: id,
                  name: newTribe.name,
                  color: newTribe.color,
                  maxCapacity: newTribe.maxCapacity ? Number(newTribe.maxCapacity) : undefined,
                })
              }
            >
              Add Tribe
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bulk Allocation</CardTitle></CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-neutral-500">Automatically assign a tribe to every approved camper who doesn&apos;t have one yet.</p>
          {bulkResult && <div className="mb-2 text-sm text-success-700">{bulkResult}</div>}
          <Button loading={bulkAssign.isPending} onClick={() => bulkAssign.mutate({ yearId: id })}>Run Bulk Auto-Allocation</Button>
        </CardBody>
      </Card>
    </div>
  );

  const configTabs = [
    { label: "Registration Readiness and Camp Settings", content: tab1Content },
    { label: "Required Documents", content: tab2Content },
    { label: "Manage Tribes", content: tab3Content },
  ];

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title={`Configure Camp: ${year.name}`}
          description="Set registration rules, dates, and requirements before opening registration."
        />

        {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        {success && <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">{success}</div>}

        <Tabs tabs={configTabs} />
      </div>
    </AppShell>
  );
}
