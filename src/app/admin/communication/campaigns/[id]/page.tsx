"use client";

import { useParams } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    DRAFT: "neutral", SCHEDULED: "info", QUEUED: "warning", SENDING: "warning",
    COMPLETED: "success", PAUSED: "warning", CANCELLED: "neutral", FAILED: "danger",
  };
  return map[status] ?? "neutral";
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign, isLoading } = api.communication.campaignGet.useQuery({ id });
  const sendMut = api.communication.campaignSend.useMutation();

  if (isLoading) {
    return <AppShell area="admin"><div className="mx-auto max-w-4xl space-y-6"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  if (!campaign) {
    return <AppShell area="admin"><div className="mx-auto max-w-4xl"><p>Campaign not found</p></div></AppShell>;
  }

  const s = (campaign as any).stats;

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title={campaign.name}
          actions={<Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-neutral-900">{s.total}</div><div className="text-xs text-neutral-500">Total</div></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-amber-600">{s.queued}</div><div className="text-xs text-neutral-500">Queued</div></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-green-600">{s.delivered}</div><div className="text-xs text-neutral-500">Delivered</div></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-red-600">{s.failed + s.bounced}</div><div className="text-xs text-neutral-500">Failed/Bounced</div></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-indigo-600">{s.opened}</div><div className="text-xs text-neutral-500">Opened</div></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-rose-600">{s.clicked}</div><div className="text-xs text-neutral-500">Clicked</div></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-neutral-600">{s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0}%</div><div className="text-xs text-neutral-500">Success Rate</div></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-cyan-600">{s.delivered > 0 ? Math.round((s.opened / s.delivered) * 100) : 0}%</div><div className="text-xs text-neutral-500">Open Rate</div></div>
        </div>

        <div className="flex gap-2">
          {campaign.status === "DRAFT" && <Button onClick={() => sendMut.mutate({ id })}>Send Now</Button>}
          {campaign.status === "SENDING" && <Button variant="secondary" onClick={() => api.communication.campaignPause.useMutation().mutate({ id })}>Pause</Button>}
        </div>

        <Card>
          <CardHeader><CardTitle>Subject</CardTitle></CardHeader>
          <CardBody><p className="text-sm">{campaign.subject}</p></CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recipients</CardTitle></CardHeader>
          <CardBody><p className="text-sm text-neutral-500">{s.total} recipients</p></CardBody>
        </Card>

        <div className="w-full rounded-full bg-neutral-100 h-2">
          {s.total > 0 && (
            <>
              <div className="h-2 rounded-l-full bg-green-500 inline-block" style={{ width: `${(s.delivered / s.total) * 100}%` }} />
              <div className="h-2 bg-amber-400 inline-block" style={{ width: `${(s.queued / s.total) * 100}%` }} />
              <div className="h-2 rounded-r-full bg-red-400 inline-block" style={{ width: `${((s.failed + s.bounced) / s.total) * 100}%` }} />
            </>
          )}
        </div>
        <div className="flex gap-4 text-xs text-neutral-500">
          <span>Delivered {s.delivered}</span>
          <span>Queued {s.queued}</span>
          <span>Failed {s.failed + s.bounced}</span>
        </div>
      </div>
    </AppShell>
  );
}
