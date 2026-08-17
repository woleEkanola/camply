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
import { InvitationRecipientPicker } from "@/components/communication/InvitationRecipientPicker";
import Link from "next/link";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    DRAFT: "neutral", SCHEDULED: "info", QUEUED: "warning", SENDING: "warning",
    COMPLETED: "success", PAUSED: "warning", NEEDS_ATTENTION: "danger", CANCELLED: "neutral", FAILED: "danger",
  };
  return map[status] ?? "neutral";
}

/**
 * One stat tile. Carries a stable `data-testid` so specs can assert the actual
 * number rather than merely that the label rendered — the old spec only checked
 * label visibility, which passed no matter what the counts said.
 */
function StatTile({ testId, label, value, tone }: { testId: string; label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-lg bg-surface-raised p-3 text-center" data-testid={`stat-${testId}`}>
      <div className={`text-xl font-bold ${tone}`} data-testid={`stat-${testId}-value`}>{value}</div>
      <div className="text-xs text-txt-secondary">{label}</div>
    </div>
  );
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const utils = api.useUtils();
  const { data: campaign, isLoading } = api.communication.campaignGet.useQuery(
    { id },
    { refetchInterval: (query) => ["SENDING", "PAUSED", "NEEDS_ATTENTION"].includes((query.state.data as any)?.status) ? 2_000 : false }
  );
  const sendMut = api.communication.campaignSend.useMutation();
  const cancelMut = api.communication.campaignCancel.useMutation();
  const pauseMut = api.communication.campaignPause.useMutation();
  const resumeMut = api.communication.campaignResume.useMutation();
  const retryHeldMut = api.communication.campaignRetryHeld.useMutation();
  const retryFailedMut = api.communication.campaignRetryFailed.useMutation();
  const kickMut = api.communication.campaignKickQueue.useMutation();
  const nonOpenerMut = api.communication.campaignSendToNonOpeners.useMutation();
  const invitationResendMut = api.communication.invitationResend.useMutation();
  const [showNonOpener, setShowNonOpener] = useState(false);
  const [showResendPicker, setShowResendPicker] = useState(false);
  const [resendRegistrationIds, setResendRegistrationIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) {
    return <AppShell area="admin"><div className="mx-auto max-w-4xl space-y-6"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  if (!campaign) {
    return <AppShell area="admin"><div className="mx-auto max-w-4xl"><p>Campaign not found</p></div></AppShell>;
  }

  const s = (campaign as any).stats;
  // Counts, rates, and the ETA all come from the server (see server/email/stats.ts
  // and server/email/appUrl.ts) so this page can't drift from the dashboard the
  // way it did when each computed its own "Success Rate" from a different base.
  const nonOpenerCount = s.nonOpeners;
  const estimatedSeconds = s.estimatedSeconds;
  const isPersonalized = !!campaign.personalizeEvent;
  const pct = (value: number | null) => (value === null ? "—" : `${value}%`);
  const lastActivity = s.lastActivityAt ? new Date(s.lastActivityAt) : null;
  const stale = campaign.status === "SENDING" && lastActivity && Date.now() - lastActivity.getTime() > 2 * 60 * 1000;
  const refresh = async (message?: string) => {
    if (message) setNotice(message);
    await utils.communication.campaignGet.invalidate({ id });
  };

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

        {notice && <div className="rounded-lg border border-accent-200 bg-accent-50 px-4 py-2 text-sm text-accent-800">{notice}</div>}
        {stale && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">No campaign progress has been recorded for more than two minutes — sending appears to have stalled. Use “Send queued now” below to nudge it, or check back shortly.</div>}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile testId="total" label="Total" value={s.total} tone="text-neutral-900" />
          <StatTile testId="queued" label="Queued" value={s.queued} tone="text-amber-600" />
          <StatTile testId="processing" label="Processing" value={s.processing} tone="text-blue-600" />
          <StatTile testId="held" label="Held" value={s.held} tone="text-amber-700" />
          <StatTile testId="sent" label="Accepted" value={s.sent} tone="text-cyan-700" />
          <StatTile testId="delivered" label="Delivered" value={s.delivered} tone="text-green-600" />
          <StatTile testId="failed" label="Failed/Bounced" value={s.failed + s.bounced} tone="text-red-600" />
          <StatTile testId="opened" label="Opened" value={s.opened} tone="text-indigo-600" />
          <StatTile testId="clicked" label="Clicked" value={s.clicked} tone="text-rose-600" />
          <StatTile testId="success-rate" label="Success Rate" value={pct(s.successRate)} tone="text-txt-secondary" />
          <StatTile testId="open-rate" label="Open Rate" value={pct(s.openRate)} tone="text-cyan-600" />
        </div>

        <div className="flex flex-wrap gap-2">
          {campaign.status === "DRAFT" && <Button onClick={async () => { await sendMut.mutateAsync({ id }); await refresh("Campaign queued."); }}>Send Now</Button>}
          {campaign.status === "SCHEDULED" && <Button variant="danger" onClick={() => { cancelMut.mutate({ id }); utils.communication.campaignGet.invalidate({ id }); }}>Cancel Schedule</Button>}
          {campaign.status === "SENDING" && <Button variant="secondary" loading={pauseMut.isPending} onClick={async () => { await pauseMut.mutateAsync({ id }); await refresh("Campaign paused. Messages already accepted by Resend are unchanged."); }}>Pause</Button>}
          {campaign.status === "PAUSED" && <Button loading={resumeMut.isPending} onClick={async () => { await resumeMut.mutateAsync({ id }); await refresh("Campaign resumed."); }}>Resume</Button>}
          {/* Sending is automatic (fires immediately on send, then self-continues
              until the queue drains) — this is a break-glass nudge for when
              progress has visibly stalled, not something a healthy send needs. */}
          {campaign.status === "SENDING" && s.queued > 0 && stale && <Button variant="secondary" loading={kickMut.isPending} onClick={async () => { const result = await kickMut.mutateAsync({ id }); await refresh(`Processed ${result.processed} queued items.`); }}>Send queued now</Button>}
          {s.held > 0 && <Button variant="secondary" loading={retryHeldMut.isPending} onClick={async () => { const result = await retryHeldMut.mutateAsync({ id }); await refresh(`${result.queued} held campers are now queued; ${result.stillHeld} still need attention.`); }}>Retry held campers</Button>}
          {s.failed > 0 && <Button variant="secondary" loading={retryFailedMut.isPending} onClick={async () => { const result = await retryFailedMut.mutateAsync({ id }); await refresh(`${result.retried} failed messages queued for retry.`); }}>Retry failed</Button>}
          {["SENDING", "PAUSED", "NEEDS_ATTENTION"].includes(campaign.status) && <Button variant="danger" size="sm" loading={cancelMut.isPending} onClick={async () => { await cancelMut.mutateAsync({ id }); await refresh("Remaining unsent messages cancelled."); }}>Cancel remaining</Button>}
          {campaign.status === "COMPLETED" && nonOpenerCount > 0 && (
            <Button onClick={() => setShowNonOpener(true)}>Send to Non-Openers ({nonOpenerCount})</Button>
          )}
          {(campaign.status === "DRAFT" || campaign.status === "SCHEDULED") && <Button variant="danger" size="sm" onClick={() => { cancelMut.mutate({ id }); utils.communication.campaignGet.invalidate({ id }); }}>Cancel</Button>}
          <Link href={`/admin/communication/campaigns/new?id=${id}`}><Button variant="secondary" size="sm">Duplicate</Button></Link>
          {isPersonalized && campaign.personalizeCampId && (
            <Button variant="secondary" size="sm" onClick={() => { setResendRegistrationIds([]); setShowResendPicker(true); }}>Resend to specific parents</Button>
          )}
        </div>

        {["SENDING", "PAUSED", "NEEDS_ATTENTION"].includes(campaign.status) && (
          <p className="text-sm text-txt-secondary">
            {s.queued + s.processing > 0
              ? `Estimated time to submit the remaining messages to Resend: ${estimatedSeconds < 60 ? `${estimatedSeconds} seconds` : `${Math.ceil(estimatedSeconds / 60)} minutes`}.`
              : "No messages are waiting for submission."}
            {lastActivity && ` Last activity: ${lastActivity.toLocaleString()}.`}
          </p>
        )}

        {isPersonalized && (
          <Card>
            <CardHeader><CardTitle>Personalized ID-card delivery</CardTitle></CardHeader>
            <CardBody className="space-y-2 text-sm text-txt-secondary">
              <p>Each camper receives a separate email containing the inline eight-card sheet, a printable A4 PDF, and all shared attachments below.</p>
              {s.heldIssues?.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {s.heldIssues.map((issue: any) => <p key={issue.id} className="text-amber-700">{issue.email || "No parent email"}: {issue.reason}</p>)}
                </div>
              )}
            </CardBody>
          </Card>
        )}

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

        <Dialog
          open={showResendPicker}
          onClose={() => setShowResendPicker(false)}
          title="Resend to specific parents"
          size="lg"
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowResendPicker(false)}>Cancel</Button>
              <Button
                loading={invitationResendMut.isPending}
                disabled={resendRegistrationIds.length === 0}
                onClick={async () => {
                  const result = await invitationResendMut.mutateAsync({
                    campId: campaign.personalizeCampId!,
                    registrationIds: resendRegistrationIds,
                    sourceCampaignId: campaign.id,
                  });
                  setShowResendPicker(false);
                  router.push(`/admin/communication/campaigns/${result.campaignId}`);
                }}
              >
                Resend to {resendRegistrationIds.length || ""}
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p className="text-txt-secondary">
              Search and select campers to resend this exact invitation (subject, message, attachments, ID card) to
              — this creates a new campaign scoped to only these recipients, so it works even though this campaign
              already sent to them once.
            </p>
            {campaign.personalizeCampId && (
              <InvitationRecipientPicker
                campId={campaign.personalizeCampId}
                value={resendRegistrationIds}
                onChange={setResendRegistrationIds}
              />
            )}
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
