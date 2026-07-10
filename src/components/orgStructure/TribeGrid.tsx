"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TribeDashboardPanel } from "@/components/orgStructure/TribeDashboardPanel";

export function TribeGrid({ organizationId, campId }: { organizationId: string; campId: string }) {
  const { data: tribes = [], isLoading } = api.orgStructure.getTribeStructure.useQuery({ organizationId, campId }, { enabled: !!organizationId && !!campId });
  const [selected, setSelected] = useState<any | null>(null);

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>;

  if (tribes.length === 0) {
    return <EmptyState title="No tribes yet" description="Create tribes from the Camps configuration page." />;
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tribes.map((t: any) => (
          <Card key={t.id} className="cursor-pointer hover:border-accent-300" onClick={() => setSelected(t)}>
            <CardBody>
              <div className="mb-2 flex items-center gap-2">
                {t.color && <span className="h-4 w-4 rounded-full border border-neutral-200" style={{ backgroundColor: t.color }} />}
                <h3 className="font-medium text-neutral-900">{t.name}</h3>
                <Badge tone="info">{t.points} pts</Badge>
              </div>
              <div className="space-y-1 text-xs text-neutral-500">
                <div>Monitor: <span className="text-neutral-700">{t.monitor?.name ?? "Unassigned"}</span></div>
                <div>Assistant: <span className="text-neutral-700">{t.assistantMonitor?.name ?? "Unassigned"}</span></div>
                <div>Campers: <span className="text-neutral-700">{t.camperCount}</span></div>
                <div>Hostel: <span className="text-neutral-700">{t.hostels?.join(", ") || "Unassigned"}</span></div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {selected && <TribeDashboardPanel tribe={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
