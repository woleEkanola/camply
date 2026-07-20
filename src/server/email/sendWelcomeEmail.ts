import { Resend } from 'resend';
import { resolveFromAddress } from './resolveFromAddress';
import { loadTemplateForEvent } from './templateLoader';
import { renderEmailWithEvent } from './renderer';
import { interpolateSubject } from './interpolate';
import { prisma } from "../db";
import { normalizeEmail } from "../../lib/email";
import { logDelivery } from "./logDelivery";

let resend: Resend | null = null;
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

export async function sendWelcomeEmail(email: string, firstName: string, verifyToken: string, organizationId?: string) {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.log("[RESEND] No API key configured — skipping welcome email");
      return;
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${verifyToken}`;
  
  // Default legacy fallbacks
  const fallbackSubject = 'Welcome to Camply — verify your email';
  const fallbackHtml = `
    <h1>Welcome to Camply, ${firstName}!</h1>
    <p>Your account has been created. Please verify your email address by clicking the link below:</p>
    <p><a href="${verifyUrl}">Verify your email</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p>${verifyUrl}</p>
    <p>Once verified, you'll be able to complete your camper's registration.</p>
  `;

  let finalFrom = 'donotreply@camply.ng'; // default fallback
  let finalReplyTo: string | undefined;
  let finalSubject = fallbackSubject;
  let finalHtml = fallbackHtml;

  try {
    const resolvedAddrs = await resolveFromAddress({ organizationId, event: "WELCOME_EMAIL" });
    finalFrom = resolvedAddrs.from;
    finalReplyTo = resolvedAddrs.replyTo ?? undefined;
  } catch (err) {
    console.error("[RESEND] Failed to resolve address parameters for WELCOME_EMAIL:", err);
  }

  // Attempt to load and render the custom template from the database
  if (organizationId) {
    try {
      const loaded = await loadTemplateForEvent(organizationId, "WELCOME_EMAIL");
      if (loaded && loaded.channels.includes("EMAIL")) {
        const variables = {
          parent_name: firstName,
          verify_url: verifyUrl,
        };

        const { text: interpolatedSubject } = interpolateSubject(loaded.subject, variables);
        const { text: interpolatedPreviewText } = interpolateSubject(loaded.previewText ?? "", variables);

        const { html } = await renderEmailWithEvent({
          eventKey: "WELCOME_EMAIL",
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
      console.error("[RESEND] Template rendering failed for WELCOME_EMAIL, falling back to legacy layout:", err);
    }
  }

  try {
    const result = await resend.emails.send({
      from: finalFrom,
      to: email,
      subject: finalSubject,
      html: finalHtml,
      replyTo: finalReplyTo,
    });
    console.log("[RESEND] Welcome email result", result.error ? `Error: ${result.error.message}` : `OK id=${result.data?.id}`);

    let userId: string | undefined;
    try {
      const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
      userId = user?.id;
    } catch { /* best-effort */ }

    await logDelivery({
      prisma,
      email,
      userId: userId ?? "",
      recipientType: "PARENT",
      deliverySource: "WELCOME_EMAIL",
      subject: finalSubject,
      providerMessageId: result.data?.id ?? undefined,
      deliveryStatus: result.error ? "FAILED" : "SENT",
      failedReason: result.error?.message,
    });
  } catch (err) {
    console.error("[RESEND] Failed to send welcome email:", err);
  }
}
