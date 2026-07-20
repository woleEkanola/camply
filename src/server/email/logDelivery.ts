import type { PrismaClient } from "@prisma/client";

type TxClient = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

interface LogDeliveryParams {
  prisma: TxClient;
  email: string;
  userId?: string;
  organizationId?: string | null;
  registrationId?: string;
  recipientType: string;
  deliverySource: string;
  subject: string;
  providerMessageId?: string;
  deliveryStatus: "SENT" | "FAILED";
  failedReason?: string;
}

export async function logDelivery(params: LogDeliveryParams): Promise<void> {
  try {
    // Skip logging if no userId — we can't attribute the email to anyone
    if (!params.userId) return;

    await (params.prisma as any).emailRecipient.create({
      data: {
        campaignId: null,
        organizationId: params.organizationId ?? null,
        userId: params.userId,
        registrationId: params.registrationId ?? null,
        email: params.email,
        recipientType: params.recipientType,
        deliveryStatus: params.deliveryStatus,
        deliverySource: params.deliverySource,
        subject: params.subject,
        providerMessageId: params.providerMessageId ?? null,
        sentAt: params.deliveryStatus === "SENT" ? new Date() : null,
        failedReason: params.failedReason ?? null,
        retryCount: params.deliveryStatus === "FAILED" ? 1 : 0,
      },
    });
  } catch {
    // best-effort — never throw from delivery logging
  }
}
