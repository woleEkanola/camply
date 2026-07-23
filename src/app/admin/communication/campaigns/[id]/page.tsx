"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog } from "@/components/ui/Dialog";
import Link from "next/link";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    DRAFT: "neutral", SCHEDULED: "info", QUEUED: "warning", SENDING: "warning",
    COMPLETED: "success", PAUSED: "warning", CANCELLED: "neutral", FAILED: "danger",
  };
  return map[status] ?? "neutral";
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = api.useUtils();
  const { data: campaign, isLoading } = api.communication.campaignGet.useQuery({ id });
  const sendMut = api.communication.campaignSend.useMutation();
  const cancelMut = api.communication.campaignCancel.useMutation();
  const nonOpenerMut = api.communication.campaignSendToNonOpeners.useMutation();
  const [showNonOpener, setShowNonOpener] = useState(false);

  if (isLoading) {
    return <AppShell area="admin"><div className="mx-auto max-w-4xl space-y-6"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  if (!campaign) {
    return <AppShell area="admin"><div className="mx-auto max-w-4xl"><p>Campaign not found</p></div></AppShell>;
  }

  const s = (campaign as any).stats;
  const nonOpenerCount = Math.max(0, s.delivered - s.opened);

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title={campaign.name}
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
              {campaign.status === "DRAFT" && (
                <Link href={`/admin/communication/campaigns/new?id=${id}`}><Button variant="secondary" size="sm">Edit</Button></Link>
              )}
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-surface-raised p-3 text-center"><div className="text-xl font-bold text-neutral-900">{s.total}</div><div className="text-xs text-txt-secondary">Total</div></div>
          <div className="rounded-lg bg-surface-raised p-3 text-center"><div className="text-xl font-bold text-amber-600">{s.queued}</div><div className="text-xs text-txt-secondary">Queued</div></div>
          <div className="rounded-lg bg-surface-raised p-3 text-center"><div className="text-xl font-bold text-green-600">{s.delivered}</div><div className="text-xs text-txt-secondary">Delivered</div></div>
          <div className="rounded-lg bg-surface-raised p-3 text-center"><div className="text-xl font-bold text-red-600">{s.failed + s.bounced}</div><div className="text-xs text-txt-secondary">Failed/Bounced</div></div>
          <div className="rounded-lg bg-surface-raised p-3 text-center"><div className="text-xl font-bold text-indigo-600">{s.opened}</div><div className="text-xs text-txt-secondary">Opened</div></div>
          <div className="rounded-lg bg-surface-raised p-3 text-center"><div className="text-xl font-bold text-rose-600">{s.clicked}</div><div className="text-xs text-txt-secondary">Clicked</div></div>
          <div className="rounded-lg bg-surface-raised p-3 text-center"><div className="text-xl font-bold text-txt-secondary">{s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0}%</div><div className="text-xs text-txt-secondary">Success Rate</div></div>
          <div className="rounded-lg bg-surface-raised p-3 text-center"><div className="text-xl font-bold text-cyan-600">{s.delivered > 0 ? Math.round((s.opened / s.delivered) * 100) : 0}%</div><div className="text-xs text-txt-secondary">Open Rate</div></div>
        </div>

        <div className="flex flex-wrap gap-2">
          {campaign.status === "DRAFT" && <Button onClick={() => sendMut.mutate({ id })}>Send Now</Button>}
          {campaign.status === "SCHEDULED" && <Button variant="danger" onClick={() => { cancelMut.mutate({ id }); utils.communication.campaignGet.invalidate({ id }); }}>Cancel Schedule</Button>}
          {campaign.status === "SENDING" && <Button variant="secondary" onClick={() => api.communication.campaignPause.useMutation().mutate({ id })}>Pause</Button>}
          {campaign.status === "COMPLETED" && nonOpenerCount > 0 && (
            <Button onClick={() => setShowNonOpener(true)}>Send to Non-Openers ({nonOpenerCount})</Button>
          )}
          {(campaign.status === "DRAFT" || campaign.status === "SCHEDULED") && <Button variant="danger" size="sm" onClick={() => { cancelMut.mutate({ id }); utils.communication.campaignGet.invalidate({ id }); }}>Cancel</Button>}
          <Link href={`/admin/communication/campaigns/new?id=${id}`}><Button variant="secondary" size="sm">Duplicate</Button></Link>
        </div>

        <Card>
          <CardHeader><CardTitle>Subject</CardTitle></CardHeader>
          <CardBody><p className="text-sm">{campaign.subject}</p></CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recipients</CardTitle></CardHeader>
          <CardBody><p className="text-sm text-txt-secondary">{s.total} recipients</p></CardBody>
        </Card>

        {(campaign.attachments as any)?.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
            <CardBody>
              <div className="space-y-1">
                {(campaign.attachments as any[]).map((att: any, i: number) => (
                  <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent-600 hover:text-accent-700">
                    {att.fileName}
                  </a>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        <div className="w-full rounded-full bg-surface-raised h-2">
          {s.total > 0 && (
            <>
              <div className="h-2 rounded-l-full bg-green-500 inline-block" style={{ width: `${(s.delivered / s.total) * 100}%` }} />
              <div className="h-2 bg-amber-400 inline-block" style={{ width: `${(s.queued / s.total) * 100}%` }} />
              <div className="h-2 rounded-r-full bg-red-400 inline-block" style={{ width: `${((s.failed + s.bounced) / s.total) * 100}%` }} />
            </>
          )}
        </div>
        <div className="flex gap-4 text-xs text-txt-secondary">
          <span>Delivered {s.delivered}</span>
          <span>Queued {s.queued}</span>
          <span>Failed {s.failed + s.bounced}</span>
        </div>

        <Dialog open={showNonOpener} onClose={() => setShowNonOpener(false)} title="Send to Non-Openers" footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowNonOpener(false)}>Cancel</Button>
            <Button onClick={async () => {
              const result = await nonOpenerMut.mutateAsync({ id });
              setShowNonOpener(false);
              router.push(`/admin/communication/campaigns/new?id=${result.id}`);
            }}>Create Follow-Up</Button>
          </div>
        }>
          <div className="text-sm space-y-2">
            <p>A new draft campaign will be created with the same content, targeting only the <strong>{nonOpenerCount}</strong> recipients who never opened this campaign.</p>
            <p className="text-txt-secondary">You can review and edit the follow-up before sending.</p>
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
