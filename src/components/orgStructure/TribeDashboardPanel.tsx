"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <span className="block text-xs text-neutral-400">{label}</span>
      <span className="font-medium text-neutral-800">{value}</span>
    </div>
  );
}

export function TribeDashboardPanel({ tribe, onClose }: { tribe: any; onClose: () => void }) {
  const utils = api.useUtils();
  const { data: history = [] } = api.tribe.pointsHistory.useQuery({ tribeId: tribe.id });
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const updatePoints = api.tribe.updatePoints.useMutation({
    onSuccess: () => {
      setDelta("");
      setReason("");
      utils.tribe.pointsHistory.invalidate({ tribeId: tribe.id });
      utils.orgStructure.getTribeStructure.invalidate();
    },
  });

  const undoPoints = api.tribe.undoPoints.useMutation({
    onSuccess: () => {
      utils.tribe.pointsHistory.invalidate({ tribeId: tribe.id });
      utils.orgStructure.getTribeStructure.invalidate();
    },
  });

  const allocationLabel: Record<string, string> = {
    MANUAL: "Manual",
    AUTOMATIC: "Automatic",
    INVITE_ONLY: "Invite Only",
  };

  return (
    <Dialog open onClose={onClose} title="" size="lg">
      {/* Header banner */}
      <div
        className="relative -mx-6 -mt-4 mb-5 flex items-end gap-4 overflow-hidden rounded-t-xl px-6 pb-5 pt-8"
        style={{ backgroundColor: tribe.color ?? "#6D4C41" }}
      >
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-wide">{tribe.name}</h2>
              {tribe.code && (
                <span className="font-mono text-sm text-white/70">{tribe.code}</span>
              )}
            </div>
            {tribe.status === "INACTIVE" && (
              <Badge tone="danger">Inactive</Badge>
            )}
          </div>
          {tribe.meaning && (
            <p className="mt-1 text-sm italic text-white/80">"{tribe.meaning}"</p>
          )}
          {tribe.motto && (
            <p className="text-sm font-semibold text-white/90">{tribe.motto}</p>
          )}
          {tribe.scripture && (
            <p className="mt-0.5 text-xs text-white/60">{tribe.scripture}</p>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-neutral-50 p-3 text-center">
            <div className="text-2xl font-bold text-neutral-900">{tribe.camperCount}</div>
            <div className="text-xs text-neutral-500">Campers</div>
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center">
            <div className="text-2xl font-bold text-neutral-900">{tribe.points}</div>
            <div className="text-xs text-neutral-500">Points</div>
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center">
            <div className="text-2xl font-bold text-neutral-900">{tribe.maxCapacity ?? "∞"}</div>
            <div className="text-xs text-neutral-500">Capacity</div>
          </div>
        </div>

        {/* Staff */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Camp Monitor" value={tribe.monitor?.name ?? "Unassigned"} />
          <Field label="Assistant Monitor" value={tribe.assistantMonitor?.name ?? "Unassigned"} />
          {tribe.hostels?.length > 0 && (
            <div className="col-span-2">
              <Field label="Hostel(s)" value={tribe.hostels.join(", ")} />
            </div>
          )}
        </div>

        {/* Identity */}
        {(tribe.gender || tribe.ageRange || tribe.allocationStrategy) && (
          <div className="flex flex-wrap gap-2">
            {tribe.gender && <Badge tone="neutral">{tribe.gender}</Badge>}
            {tribe.ageRange && <Badge tone="neutral">{tribe.ageRange}</Badge>}
            {tribe.allocationStrategy && (
              <Badge tone={tribe.allocationStrategy === "AUTOMATIC" ? "info" : tribe.allocationStrategy === "INVITE_ONLY" ? "warning" : "neutral"}>
                {allocationLabel[tribe.allocationStrategy] ?? tribe.allocationStrategy}
              </Badge>
            )}
          </div>
        )}

        {/* Description */}
        {tribe.description && (
          <p className="text-sm text-neutral-600">{tribe.description}</p>
        )}

        {/* ── Points system ── */}
        <div className="rounded-lg border border-neutral-100 p-4">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">Award / Deduct Points</h3>
          <div className="flex gap-2">
            <Input
              containerClassName="w-24"
              type="number"
              placeholder="+/-10"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
            <Input
              containerClassName="flex-1"
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              disabled={!delta}
              loading={updatePoints.isPending}
              onClick={() =>
                updatePoints.mutate({
                  tribeId: tribe.id,
                  delta: Number(delta),
                  reason: reason || undefined,
                })
              }
            >
              Apply
            </Button>
          </div>

          {/* History */}
          {history.length > 0 ? (
            <div className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800 max-h-56 overflow-y-auto">
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between py-2 text-sm gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-neutral-700 dark:text-neutral-300 font-medium block truncate">
                      {h.reason || "Points Award"}
                    </span>
                    {h.reversesEventId && (
                      <span className="text-[11px] text-neutral-400 block">Reversal</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-bold tabular-nums text-sm ${h.delta >= 0 ? "text-success-600" : "text-danger-600"}`}>
                      {h.delta >= 0 ? `+${h.delta}` : h.delta}
                    </span>
                    {!h.reversesEventId && (
                      <button
                        type="button"
                        disabled={undoPoints.isPending}
                        onClick={() =>
                          undoPoints.mutate({
                            tribeId: tribe.id,
                            scoreEventId: h.id,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-neutral-600 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/40 transition cursor-pointer disabled:opacity-50"
                        title="Undo this points award"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">No points activity yet.</p>
          )}
        </div>

        {/* Placeholders */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-neutral-900">Announcements</h3>
            <p className="text-sm text-neutral-400">No tribe announcements yet.</p>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-neutral-900">Incidents & Alerts</h3>
            <p className="text-sm text-neutral-400">View from the Incidents dashboard.</p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
