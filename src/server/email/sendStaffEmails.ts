import { Resend } from "resend";
import { resolveFromAddress } from "./resolveFromAddress";
import { loadTemplateForEvent } from "./templateLoader";
import { renderEmailWithEvent } from "./renderer";
import { interpolateSubject } from "./interpolate";

let resend: Resend | null = null;

function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export async function sendStaffApprovedEmail(params: {
  to: string;
  name: string;
  campName: string;
  type: "TEACHER" | "VOLUNTEER";
  dashboardUrl: string;
  orgSlug?: string;
  organizationId?: string;
}) {
  const roleLabel = params.type === "TEACHER" ? "Teacher" : "Volunteer";

  let finalFrom = "donotreply@camply.ng";
  let finalReplyTo: string | undefined;

  try {
    const resolvedAddrs = await resolveFromAddress({
      organizationId: params.organizationId,
      event: "STAFF_APPROVED",
    });
    finalFrom = resolvedAddrs.from;
    finalReplyTo = resolvedAddrs.replyTo ?? undefined;
  } catch (err) {
    console.error("[RESEND] Failed to resolve addresses for STAFF_APPROVED:", err);
  }

  const fallbackSubject = `You're approved as a ${roleLabel} for ${params.campName}!`;
  const fallbackHtml = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="color:#E67E22;">Welcome to the team!</h1>
      <p>Hi ${params.name}, your ${roleLabel.toLowerCase()} registration for <strong>${params.campName}</strong> has been approved.</p>
      <p><a href="${params.dashboardUrl}">Go to your dashboard</a></p>
    </div>
  `;

  let finalSubject = fallbackSubject;
  let finalHtml = fallbackHtml;

  if (params.organizationId) {
    try {
      const loaded = await loadTemplateForEvent(params.organizationId, "STAFF_APPROVED");
      if (loaded && loaded.channels.includes("EMAIL")) {
        const variables = {
          staff_name: params.name,
          staff_role: roleLabel,
          camp_name: params.campName,
          dashboard_url: params.dashboardUrl,
        };

        const { text: interpolatedSubject } = interpolateSubject(loaded.subject, variables);
        const { text: interpolatedPreviewText } = interpolateSubject(loaded.previewText ?? "", variables);

        const { html } = await renderEmailWithEvent({
          eventKey: "STAFF_APPROVED",
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
      console.error("[RESEND] Template rendering failed for STAFF_APPROVED, falling back to legacy:", err);
    }
  }

  await getResend().emails.send({
    from: finalFrom,
    to: params.to,
    subject: finalSubject,
    html: finalHtml,
    replyTo: finalReplyTo,
  });
}

export async function sendStaffRejectedEmail(params: {
  to: string;
  name: string;
  campName: string;
  type: "TEACHER" | "VOLUNTEER";
  reason?: string;
  orgSlug?: string;
  organizationId?: string;
}) {
  const roleLabel = params.type === "TEACHER" ? "Teacher" : "Volunteer";

  let finalFrom = "donotreply@camply.ng";
  let finalReplyTo: string | undefined;

  try {
    const resolvedAddrs = await resolveFromAddress({
      organizationId: params.organizationId,
      event: "STAFF_REJECTED",
    });
    finalFrom = resolvedAddrs.from;
    finalReplyTo = resolvedAddrs.replyTo ?? undefined;
  } catch (err) {
    console.error("[RESEND] Failed to resolve addresses for STAFF_REJECTED:", err);
  }

  const fallbackSubject = `Update on your ${roleLabel.toLowerCase()} registration for ${params.campName}`;
  const fallbackHtml = `
    <p>Hi ${params.name}, your ${roleLabel.toLowerCase()} registration for <strong>${params.campName}</strong> was not approved.</p>
    ${params.reason ? `<p>Reason: ${params.reason}</p>` : ""}
  `;

  let finalSubject = fallbackSubject;
  let finalHtml = fallbackHtml;

  if (params.organizationId) {
    try {
      const loaded = await loadTemplateForEvent(params.organizationId, "STAFF_REJECTED");
      if (loaded && loaded.channels.includes("EMAIL")) {
        const variables = {
          staff_name: params.name,
          staff_role: roleLabel,
          camp_name: params.campName,
          rejection_reason: params.reason || "No reason provided.",
        };

        const { text: interpolatedSubject } = interpolateSubject(loaded.subject, variables);
        const { text: interpolatedPreviewText } = interpolateSubject(loaded.previewText ?? "", variables);

        const { html } = await renderEmailWithEvent({
          eventKey: "STAFF_REJECTED",
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
      console.error("[RESEND] Template rendering failed for STAFF_REJECTED, falling back to legacy:", err);
    }
  }

  await getResend().emails.send({
    from: finalFrom,
    to: params.to,
    subject: finalSubject,
    html: finalHtml,
    replyTo: finalReplyTo,
  });
}
