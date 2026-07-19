import { Resend } from 'resend';
import { resolveFromAddress } from './resolveFromAddress';
import { loadTemplateForEvent } from './templateLoader';
import { renderEmailWithEvent } from './renderer';
import { interpolateSubject } from './interpolate';
import { prisma } from "../db";
import { normalizeEmail } from "../../lib/email";

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    console.log("[RESEND] Initializing Resend client");
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendOtpEmail(email: string, otp: string, orgSlug?: string, organizationId?: string) {
  let finalOrgId = organizationId;

  // Fetch organizationId by email if not passed (e.g. forgot password flow)
  if (!finalOrgId) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { organizationId: true },
      });
      if (user?.organizationId) {
        finalOrgId = user.organizationId;
      }
    } catch (err) {
      console.error("[RESEND] Failed to lookup user organizationId for OTP:", err);
    }
  }

  let finalFrom = 'donotreply@camply.ng';
  let finalReplyTo: string | undefined;

  try {
    const resolvedAddrs = await resolveFromAddress({
      organizationId: finalOrgId,
      event: "OTP_EMAIL",
    });
    finalFrom = resolvedAddrs.from;
    finalReplyTo = resolvedAddrs.replyTo ?? undefined;
  } catch (err) {
    console.error("[RESEND] Failed to resolve addresses for OTP_EMAIL:", err);
  }

  const fallbackSubject = 'Your OTP Code';
  const fallbackHtml = `<p>Your OTP code is: <b>${otp}</b></p>`;

  let finalSubject = fallbackSubject;
  let finalHtml = fallbackHtml;

  if (finalOrgId) {
    try {
      const loaded = await loadTemplateForEvent(finalOrgId, "OTP_EMAIL");
      if (loaded && loaded.channels.includes("EMAIL")) {
        const variables = {
          otp_code: otp,
        };

        const { text: interpolatedSubject } = interpolateSubject(loaded.subject, variables);
        const { text: interpolatedPreviewText } = interpolateSubject(loaded.previewText ?? "", variables);

        const { html } = await renderEmailWithEvent({
          eventKey: "OTP_EMAIL",
          tiptapJson: loaded.tiptapJson,
          variables,
          branding: loaded.branding,
          previewText: interpolatedPreviewText,
        });

        finalSubject = interpolatedSubject;
        finalHtml = html;
        if (loaded.replyTo) {
          finalReplyTo = loaded.replyTo;
        }
      }
    } catch (err) {
      console.error("[RESEND] Template rendering failed for OTP_EMAIL, falling back to legacy:", err);
    }
  }

  const result = await getResend().emails.send({
    from: finalFrom,
    to: email,
    subject: finalSubject,
    html: finalHtml,
    replyTo: finalReplyTo,
  });
  console.log("[RESEND] Send result", result.error ? `Error: ${result.error.message}` : `OK id=${result.data?.id}`);
}
