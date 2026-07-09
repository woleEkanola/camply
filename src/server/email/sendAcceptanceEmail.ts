import { Resend } from "resend";

let resend: Resend | null = null;

export interface AcceptanceEmailParams {
  to: string;
  camperName: string;
  campName: string;
  centreName: string;
  registrationNumber: string;
  reportingDate?: string;
  qrDataUrl: string;
  viewUrl: string;
  remindersHtml?: string | null;
  tribeName?: string | null;
  tribeColor?: string | null;
}

export async function sendAcceptanceEmail(params: AcceptanceEmailParams) {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h1 style="color:#E67E22;">Congratulations!</h1>
      <p>Your registration has been approved.</p>
      <p><strong>Camper:</strong> ${params.camperName}<br/>
         <strong>Camp:</strong> ${params.campName}<br/>
         <strong>Centre:</strong> ${params.centreName}<br/>
         <strong>Registration Number:</strong> ${params.registrationNumber}
         ${params.tribeName ? `<br/><strong>Tribe:</strong> <span style="color:${params.tribeColor ?? "#E67E22"}">${params.tribeName}</span>` : ""}
         ${params.reportingDate ? `<br/><strong>Reporting Date:</strong> ${params.reportingDate}` : ""}
      </p>
      <p>Please present the QR code below during check-in.</p>
      <img src="${params.qrDataUrl}" alt="QR Code" width="180" height="180" />
      <p><a href="${params.viewUrl}">View Registration</a></p>
      ${params.remindersHtml ? `<div>${params.remindersHtml}</div>` : ""}
    </div>
  `;

  await resend.emails.send({
    from: "camply@eleto.online",
    to: params.to,
    subject: `You're approved for ${params.campName}!`,
    html,
  });
}

export async function sendRejectionEmail(params: { to: string; camperName: string; campName: string; reason: string }) {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  await resend.emails.send({
    from: "camply@eleto.online",
    to: params.to,
    subject: `Update on your registration for ${params.campName}`,
    html: `<p>Your registration for <strong>${params.camperName}</strong> to <strong>${params.campName}</strong> was not approved.</p><p>Reason: ${params.reason}</p>`,
  });
}

export async function sendCorrectionEmail(params: { to: string; camperName: string; campName: string; message: string; viewUrl: string }) {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  await resend.emails.send({
    from: "camply@eleto.online",
    to: params.to,
    subject: `Action needed for ${params.camperName}'s registration`,
    html: `<p>We need a bit more information for <strong>${params.camperName}</strong>'s registration to <strong>${params.campName}</strong>:</p><p>${params.message}</p><p><a href="${params.viewUrl}">Update Registration</a></p>`,
  });
}

export async function sendWaitlistEmail(params: { to: string; camperName: string; campName: string }) {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  await resend.emails.send({
    from: "camply@eleto.online",
    to: params.to,
    subject: `${params.camperName} is on the waitlist for ${params.campName}`,
    html: `<p><strong>${params.camperName}</strong> is currently on the waitlist for <strong>${params.campName}</strong>. We'll notify you if a space opens up.</p>`,
  });
}
