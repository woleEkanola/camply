import type { PrismaClient } from "@prisma/client";
import { resolveAudience, type ResolvedUser } from "../audience/resolver";
import type { AudienceFilter } from "../audience/filters";
import { injectTracking } from "../tracking/injectTracking";

type TxClient = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

interface SendCampaignResult {
  recipientCount: number;
}

function recipientTypeForRole(role: string): string {
  if (role === "PARENT") return "PARENT";
  if (role === "TEACHER") return "TEACHER";
  if (role === "VOLUNTEER") return "VOLUNTEER";
  if (role === "CAMPUS_REPRESENTATIVE") return "CAMPUS_REP";
  return "ADMIN";
}

/**
 * Renders one campaign email for one recipient (branding + variables + tracking
 * pixel/link-rewriting) and sends it via Resend. Shared by the initial batch in
 * sendCampaign and by the sweep's processCampaignSideEffect so the two paths
 * can't drift apart.
 */
async function renderAndSendCampaignEmail(
  campaign: any,
  recipient: { id: string; email: string }
): Promise<{ providerMessageId: string | undefined }> {
  const org = campaign.organization;
  const branding = org?.branding;

  const variables = {
    organization_name: org?.name ?? "",
    support_email: branding?.supportEmail ?? "",
    support_phone: branding?.supportPhone ?? "",
    sender_name: branding?.senderName ?? "",
    dashboard_url: `${process.env.NEXTAUTH_URL ?? "http://localhost:3001"}/dashboard`,
  };

  const { renderEmail } = await import("../renderer");
  const { interpolateSubject } = await import("../interpolate");
  const { resolveFromAddress } = await import("../resolveFromAddress");

  const { from, replyTo } = await resolveFromAddress({
    organizationId: campaign.organizationId,
    broadcast: campaign,
    senderName: branding?.senderName,
  });

  const { text: interpolatedSubject } = interpolateSubject(campaign.subject, variables);

  const { html: rawHtml } = await renderEmail({
    tiptapJson: campaign.body as Record<string, unknown>,
    variables,
    branding: branding
      ? {
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          buttonColor: branding.buttonColor,
          headerImageUrl: branding.headerImageUrl,
          footerText: branding.footerText,
          supportEmail: branding.supportEmail,
          supportPhone: branding.supportPhone,
          websiteUrl: branding.websiteUrl,
          facebookUrl: branding.facebookUrl,
          instagramUrl: branding.instagramUrl,
          address: branding.address,
        }
      : null,
  });

  const html = injectTracking(rawHtml, { recipientId: recipient.id, campaignId: campaign.id });

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const resendResult = await resend.emails.send({
    from,
    to: recipient.email,
    subject: interpolatedSubject,
    html,
    replyTo,
    attachments: campaign.attachments
      ? (campaign.attachments as Array<{ url: string; fileName: string }>).map((a) => ({
          filename: a.fileName,
          path: a.url,
        }))
      : undefined,
  });

  return { providerMessageId: resendResult.data?.id ?? undefined };
}

/**
 * Sends (or resumes sending) a campaign.
 *
 * Resume semantics: which recipients already exist is decided by the
 * EmailRecipient rows' userIds — NOT by side-effect txIds (those are recipient
 * ids, a different id space — mixing them up resends to everyone). A campaign
 * in SENDING with existing effects is a resume (e.g. after PAUSED), not an
 * error; COMPLETED/CANCELLED campaigns refuse to send.
 */
export async function sendCampaign(
  prisma: TxClient,
  campaignId: string
): Promise<SendCampaignResult> {
  const campaign = await (prisma as any).emailCampaign.findUnique({
    where: { id: campaignId },
    include: { organization: { include: { branding: true } }, savedAudience: true },
  });

  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "COMPLETED") throw new Error("Campaign is already completed");
  if (campaign.status === "CANCELLED") throw new Error("Campaign is cancelled");

  // Resolve audience — prefer savedAudience filterDefinition, fall back to inline audienceFilter
  let filter: AudienceFilter;
  if (campaign.savedAudience?.filterDefinition) {
    filter = campaign.savedAudience.filterDefinition as AudienceFilter;
  } else {
    filter = (campaign.audienceFilter || { recipientType: "ALL" }) as AudienceFilter;
  }

  const { users } = await resolveAudience(prisma, campaign.organizationId, filter);

  // Resume-safe dedupe: recipients already created for THIS campaign, keyed by userId
  const existingRecipients = await (prisma as any).emailRecipient.findMany({
    where: { campaignId },
    select: { userId: true },
  });
  const existingUserIds = new Set<string>(existingRecipients.map((r: any) => r.userId));
  const newUsers = users.filter((u) => !existingUserIds.has(u.id));

  if (existingRecipients.length === 0 && newUsers.length === 0) {
    await (prisma as any).emailCampaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    throw new Error("No recipients found for the selected audience");
  }

  // Update campaign status (idempotent on resume)
  await (prisma as any).emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "SENDING",
      startedAt: campaign.startedAt ?? new Date(),
      recipientCount: users.length,
    },
  });

  if (newUsers.length > 0) {
    // Batch create recipients
    const recipients = await (prisma as any).$transaction(
      newUsers.map((user: ResolvedUser) =>
        (prisma as any).emailRecipient.create({
          data: {
            campaignId,
            organizationId: campaign.organizationId,
            userId: user.id,
            email: user.email,
            recipientType: recipientTypeForRole(user.role),
            deliveryStatus: "QUEUED",
          },
        })
      )
    );

    // Batch create side effects
    await (prisma as any).sideEffect.createMany({
      data: recipients.map((recipient: any, i: number) => ({
        campaignId,
        organizationId: campaign.organizationId,
        type: "CAMPAIGN_SEND",
        status: "QUEUED",
        deliverySource: "CAMPAIGN",
        recipientEmail: newUsers[i].email,
        recipientType: newUsers[i].role,
        txId: recipient.id,
      })),
    });
  }

  // Process first batch (up to 50) immediately
  const due = await (prisma as any).sideEffect.findMany({
    where: {
      campaignId,
      type: "CAMPAIGN_SEND",
      status: "QUEUED",
      runAfter: { lte: new Date() },
    },
    take: 50,
  });

  for (const effect of due) {
    try {
      const recipient = await (prisma as any).emailRecipient.findUnique({
        where: { id: effect.txId },
      });
      if (!recipient) continue;

      const { providerMessageId } = await renderAndSendCampaignEmail(campaign, recipient);

      await (prisma as any).emailRecipient.update({
        where: { id: recipient.id },
        data: {
          deliveryStatus: "SENT",
          sentAt: new Date(),
          providerMessageId: providerMessageId ?? undefined,
        },
      });
      await (prisma as any).sideEffect.update({
        where: { id: effect.id },
        data: { status: "DONE" },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await (prisma as any).emailRecipient.update({
        where: { id: effect.txId },
        data: {
          deliveryStatus: "FAILED",
          failedReason: errorMsg,
          retryCount: { increment: 1 },
        },
      }).catch(() => {});
      await (prisma as any).sideEffect.update({
        where: { id: effect.id },
        data: {
          status: "FAILED",
          lastError: errorMsg,
          attempts: { increment: 1 },
        },
      }).catch(() => {});
    }
  }

  // If the immediate batch drained the queue, the campaign is done
  const remaining = await (prisma as any).sideEffect.count({
    where: { campaignId, type: "CAMPAIGN_SEND", status: "QUEUED" },
  });
  if (remaining === 0) {
    await (prisma as any).emailCampaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  return { recipientCount: users.length };
}

export async function processCampaignSideEffect(
  prisma: TxClient,
  effectId: string
): Promise<void> {
  const effect = await (prisma as any).sideEffect.findUniqueOrThrow({ where: { id: effectId } });
  const recipient = await (prisma as any).emailRecipient.findUniqueOrThrow({ where: { id: effect.txId } });
  const campaign = await (prisma as any).emailCampaign.findUniqueOrThrow({
    where: { id: effect.campaignId! },
    include: { organization: { include: { branding: true } } },
  });

  const { providerMessageId } = await renderAndSendCampaignEmail(campaign, recipient);

  await (prisma as any).emailRecipient.update({
    where: { id: recipient.id },
    data: {
      deliveryStatus: "SENT",
      sentAt: new Date(),
      providerMessageId: providerMessageId ?? undefined,
    },
  });
}

export async function scheduleCampaign(
  prisma: TxClient,
  campaignId: string,
  scheduledFor: Date
): Promise<void> {
  await (prisma as any).emailCampaign.update({
    where: { id: campaignId },
    data: { status: "SCHEDULED", scheduledFor },
  });
}

export async function processScheduledCampaigns(
  prisma: TxClient
): Promise<void> {
  const due = await (prisma as any).emailCampaign.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: new Date() },
    },
    take: 10,
  });

  for (const campaign of due) {
    try {
      await sendCampaign(prisma, campaign.id);
    } catch (err) {
      console.error(
        `Failed to process scheduled campaign ${campaign.id}:`,
        err
      );
    }
  }
}
