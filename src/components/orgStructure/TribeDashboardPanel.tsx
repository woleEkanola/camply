"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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

  return (
    <Dialog open onClose={onClose} title={tribe.name} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {tribe.color && <span className="h-6 w-6 rounded-full border border-neutral-200" style={{ backgroundColor: tribe.color }} />}
          <Badge tone="info">{tribe.points} points</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-neutral-500">Camp Monitor</span><div className="font-medium text-neutral-900">{tribe.monitor?.name ?? "Unassigned"}</div></div>
          <div><span className="text-neutral-500">Assistant Monitor</span><div className="font-medium text-neutral-900">{tribe.assistantMonitor?.name ?? "Unassigned"}</div></div>
          <div><span className="text-neutral-500">Campers</span><div className="font-medium text-neutral-900">{tribe.camperCount}</div></div>
          <div><span className="text-neutral-500">Hostel</span><div className="font-medium text-neutral-900">{tribe.hostels?.join(", ") || "Unassigned"}</div></div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Award / Deduct Points</h3>
          <div className="flex gap-2">
            <Input containerClassName="w-24" type="number" placeholder="+/-10" value={delta} onChange={(e) => setDelta(e.target.value)} />
            <Input containerClassName="flex-1" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button
              disabled={!delta}
              loading={updatePoints.isPending}
              onClick={() => updatePoints.mutate({ tribeId: tribe.id, delta: Number(delta), reason: reason || undefined })}
            >
              Apply
            </Button>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            {history.map((h: any) => (
              <div key={h.id} className="flex justify-between text-neutral-600">
                <span>{h.reason || "—"}</span>
                <span className={h.delta >= 0 ? "text-success-600" : "text-danger-600"}>{h.delta >= 0 ? `+${h.delta}` : h.delta}</span>
              </div>
            ))}
            {history.length === 0 && <p className="text-neutral-500">No points activity yet.</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">Announcements</h3>
            <p className="text-sm text-neutral-500">No tribe announcements yet.</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">Incidents & Medical Alerts</h3>
            <p className="text-sm text-neutral-500">View from the Incidents and Medical dashboards.</p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
