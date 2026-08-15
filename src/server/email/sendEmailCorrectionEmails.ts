import { Resend } from "resend";
import { resolveFromAddress } from "./resolveFromAddress";

let resend: Resend | null = null;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendEmailCorrectionEmails(params: {
  oldEmail: string;
  newEmail: string;
  firstName?: string | null;
  organizationId: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    return { oldAddressNotified: false, newAddressNotified: false };
  }

  resend ??= new Resend(process.env.RESEND_API_KEY);
  const { from, replyTo } = await resolveFromAddress({
    organizationId: params.organizationId,
    event: "USER_EMAIL_CORRECTED",
  });
  const greeting = params.firstName ? `Hello ${escapeHtml(params.firstName)},` : "Hello,";
  const safeOldEmail = escapeHtml(params.oldEmail);
  const safeNewEmail = escapeHtml(params.newEmail);

  const [oldResult, newResult] = await Promise.allSettled([
    resend.emails.send({
      from,
      to: params.oldEmail,
      subject: "Your Camply email address was changed",
      html: `<p>${greeting}</p><p>An administrator changed the email address on your Camply account from <strong>${safeOldEmail}</strong> to <strong>${safeNewEmail}</strong>.</p><p>If you did not expect this change, please contact your camp administrator immediately.</p>`,
      replyTo,
    }),
    resend.emails.send({
      from,
      to: params.newEmail,
      subject: "Your new Camply email address",
      html: `<p>${greeting}</p><p>Your Camply account now uses <strong>${safeNewEmail}</strong>.</p><p>Please sign in again using this new email address. Your password has not changed.</p>`,
      replyTo,
    }),
  ]);

  return {
    oldAddressNotified: oldResult.status === "fulfilled",
    newAddressNotified: newResult.status === "fulfilled",
  };
}
