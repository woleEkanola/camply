import type { PrismaClient } from "@prisma/client";
import { resolveAudience, type ResolvedUser } from "../audience/resolver";
import type { AudienceFilter } from "../audience/filters";

type TxClient = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

interface SendCampaignResult {
  recipientCount: number;
}

export async function sendCampaign(
  prisma: TxClient,
  campaignId: string
): Promise<SendCampaignResult> {
  const campaign = await (prisma as any).emailCampaign.findUnique({
    where: { id: campaignId },
    include: { organization: { include: { branding: true } } },
  });

  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "SENDING" || campaign.status === "COMPLETED") {
    throw new Error(`Campaign is already ${campaign.status.toLowerCase()}`);
  }

  // Resolve audience
  const filter = (campaign.audienceFilter || {
    recipientType: "ALL",
  }) as AudienceFilter;

  const { users } = await resolveAudience(prisma, campaign.organizationId, filter);

  if (users.length === 0) {
    throw new Error("No recipients found for the selected audience");
  }

  // Update campaign status
  await (prisma as any).emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "SENDING",
      startedAt: new Date(),
      recipientCount: users.length,
    },
  });

  // Create EmailRecipient + SideEffect rows
  const org = campaign.organization;
  const branding = org?.branding;

  for (const user of users) {
    const recipient = await (prisma as any).emailRecipient.create({
      data: {
        campaignId,
        userId: user.id,
        email: user.email,
        recipientType: user.role === "PARENT"
          ? "PARENT"
          : user.role === "TEACHER"
          ? "TEACHER"
          : user.role === "VOLUNTEER"
          ? "VOLUNTEER"
          : user.role === "CAMPUS_REPRESENTATIVE"
          ? "CAMPUS_REP"
          : "ADMIN",
        deliveryStatus: "QUEUED",
      },
    });

    await (prisma as any).sideEffect.create({
      data: {
        campaignId,
        type: "CAMPAIGN_SEND",
        status: "QUEUED",
        deliverySource: "CAMPAIGN",
        recipientEmail: user.email,
        recipientType: user.role,
        txId: recipient.id,
      },
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

      const { text: interpolatedSubject } = interpolateSubject(
        campaign.subject,
        variables
      );

      const { html } = await renderEmail({
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

      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const resendResult = await resend.emails.send({
        from,
        to: recipient.email,
        subject: interpolatedSubject,
        html,
        replyTo,
        attachments: campaign.attachments
          ? (campaign.attachments as Array<{
              url: string;
              fileName: string;
            }>).map((a) => ({
              filename: a.fileName,
              path: a.url,
            }))
          : undefined,
      });

      await (prisma as any).emailRecipient.update({
        where: { id: recipient.id },
        data: {
          deliveryStatus: "SENT",
          sentAt: new Date(),
          providerMessageId: resendResult.data?.id ?? undefined,
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

  return { recipientCount: users.length };
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
