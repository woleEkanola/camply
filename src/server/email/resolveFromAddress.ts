import { prisma } from "../db";

const LOCAL_PART_REGEX = /^[a-zA-Z0-9._-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResolveFromAddressParams {
  organizationId?: string | null;
  event?: string | null;
  senderName?: string | null;
  senderMode?: string | null;
  customFromLocalPart?: string | null;
  replyTo?: string | null;
  broadcast?: {
    senderMode?: string | null;
    customFromLocalPart?: string | null;
    replyTo?: string | null;
  } | null;
}

/**
 * Resolves the sender address and reply-to for an email flow.
 * Returns { from: string, replyTo: string | undefined }.
 */
export async function resolveFromAddress(params: ResolveFromAddressParams): Promise<{
  from: string;
  replyTo: string | undefined;
}> {
  // 1. If it's OTP_EMAIL, it is strictly locked to donotreply@camply.ng
  if (params.event === "OTP_EMAIL") {
    return {
      from: "donotreply@camply.ng",
      replyTo: undefined,
    };
  }

  // 2. Determine initial field values from arguments or broadcast
  let senderMode = params.senderMode;
  let customFromLocalPart = params.customFromLocalPart;
  let replyToVal = params.replyTo;

  if (params.broadcast) {
    senderMode = params.broadcast.senderMode;
    customFromLocalPart = params.broadcast.customFromLocalPart;
    replyToVal = params.broadcast.replyTo;
  }

  // 3. If no senderMode is specified and we have an organizationId and event, load it from config
  if (!senderMode && params.organizationId && params.event) {
    try {
      const config = await prisma.emailEventConfig.findUnique({
        where: {
          organizationId_event: {
            organizationId: params.organizationId,
            event: params.event,
          },
        },
      });
      if (config) {
        senderMode = config.senderMode;
        customFromLocalPart = config.customFromLocalPart;
        replyToVal = config.replyTo;
      }
    } catch (err) {
      console.error("[resolveFromAddress] Error loading EmailEventConfig:", err);
    }
  }

  // Fallback to default senderMode if not set
  if (!senderMode) {
    senderMode = "ORG_SLUG";
  }

  // 4. Retrieve organization slug and senderName if organizationId is available
  let orgSlug: string | null = null;
  let resolvedSenderName = params.senderName;

  if (params.organizationId) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: params.organizationId },
        include: { branding: true },
      });
      if (org) {
        orgSlug = org.slug;
        if (!resolvedSenderName && org.branding?.senderName) {
          resolvedSenderName = org.branding.senderName;
        }
      }
    } catch (err) {
      console.error("[resolveFromAddress] Error loading Organization branding:", err);
    }
  }

  // 5. Determine the local part based on senderMode
  let localPart = "donotreply";

  if (senderMode === "ORG_SLUG" && orgSlug && LOCAL_PART_REGEX.test(orgSlug)) {
    localPart = orgSlug;
  } else if (senderMode === "CUSTOM" && customFromLocalPart && LOCAL_PART_REGEX.test(customFromLocalPart)) {
    localPart = customFromLocalPart;
  } else if (senderMode === "DONOTREPLY") {
    localPart = "donotreply";
  }

  const email = `${localPart.toLowerCase()}@camply.ng`;

  // 6. Format with sender name if present
  const from = resolvedSenderName && resolvedSenderName.trim()
    ? `${resolvedSenderName.trim()} <${email}>`
    : email;

  // 7. Validate replyTo email before returning
  const replyTo = replyToVal && EMAIL_REGEX.test(replyToVal.trim())
    ? replyToVal.trim()
    : undefined;

  return { from, replyTo };
}
