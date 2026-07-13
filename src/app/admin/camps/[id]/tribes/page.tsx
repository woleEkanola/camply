"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";

const CRITERIA: { key: string; label: string }[] = [
  { key: "SIBLINGS_TOGETHER", label: "Keep Siblings Together" },
  { key: "SIBLINGS_APART", label: "Separate Siblings" },
  { key: "GENDER", label: "Balance by Gender" },
  { key: "AGE", label: "Balance by Age Group" },
  { key: "CAMPUS", label: "Balance by Campus" },
  { key: "CHURCH", label: "Balance by Church" },
  { key: "SCHOOL", label: "Balance by School" },
  { key: "POPULATION", label: "Balance by Population" },
];

export default function TribesConfigPage() {
  const params = useParams();
  const router = useRouter();
  const campId = typeof params.id === "string" ? params.id : "";
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  const utils = api.useUtils();
  const { data: camp } = api.camp.getById.useQuery({ id: campId }, { enabled: !!campId });
  const { data: tribes, refetch: refetchTribes } = api.tribe.listByCamp.useQuery({ campId }, { enabled: !!campId });

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"MANUAL" | "AUTOMATIC" | "HYBRID">("MANUAL");
  const [rules, setRules] = useState<{ criterion: string; enabled: boolean }[]>(
    CRITERIA.map((c) => ({ criterion: c.key, enabled: false }))
  );
  const [newTribe, setNewTribe] = useState({ name: "", color: "#E67E22", maxCapacity: "" });
  const [bulkResult, setBulkResult] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!camp) return;
    setEnabled((camp as any).tribeAllocationEnabled ?? false);
    setMode((camp as any).tribeAllocationMode ?? "MANUAL");
    const existingRules = (camp as any).tribeAllocationRules;
    if (Array.isArray(existingRules) && existingRules.length > 0) {
      setRules(CRITERIA.map((c) => ({ criterion: c.key, enabled: !!existingRules.find((r: any) => r.criterion === c.key)?.enabled })));
    }
  }, [camp]);

  const saveConfig = api.tribe.updateAllocationConfig.useMutation({
    onSuccess: () => utils.camp.getById.invalidate({ id: campId }),
  });

  const createTribe = api.tribe.create.useMutation({
    onSuccess: () => {
      refetchTribes();
      setNewTribe({ name: "", color: "#E67E22", maxCapacity: "" });
    },
  });
  const updateTribe = api.tribe.update.useMutation({ onSuccess: () => refetchTribes() });
  const deleteTribe = api.tribe.delete.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      refetchTribes();
    },
    onError: (err) => {
      setError(`Error deleting tribe: ${err.message}`);
      setDeleteTarget(null);
    },
  });
  const bulkAssign = api.tribe.bulkAutoAssign.useMutation({
    onSuccess: (results) => {
      const ok = results.filter((r) => r.tribeId).length;
      setBulkResult(`Assigned ${ok} of ${results.length} campers.`);
      refetchTribes();
    },
  });

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader title={`Tribes: ${camp?.name ?? ""}`} />

        {error && (
          <div className="rounded-md bg-danger-50 p-4 text-sm text-danger-700">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Allocation Settings</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500" />
              Enable tribe allocation for this camp
            </label>

            {enabled && (
              <>
                <Select label="Allocation Mode" containerClassName="max-w-sm" value={mode} onChange={(e) => setMode(e.target.value as any)}>
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
                          checked={!!rules.find((r) => r.criterion === c.key)?.enabled}
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
              loading={saveConfig.isPending}
              onClick={() => saveConfig.mutate({ campId, tribeAllocationEnabled: enabled, tribeAllocationMode: mode, tribeAllocationRules: rules })}
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
                    <button className="text-danger-600 hover:underline" onClick={() => setDeleteTarget({ id: tribe.id, name: tribe.name })}>Delete</button>
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
                    campId,
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
            <Button loading={bulkAssign.isPending} onClick={() => bulkAssign.mutate({ campId })}>Run Bulk Auto-Allocation</Button>
          </CardBody>
        </Card>
      </div>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">
          Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
        </p>
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
    </AppShell>
  );
}
