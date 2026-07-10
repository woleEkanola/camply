import { Resend } from "resend";

let resend: Resend | null = null;

export async function sendStaffApprovedEmail(params: { to: string; name: string; campName: string; type: "TEACHER" | "VOLUNTEER"; dashboardUrl: string }) {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  const role = params.type === "TEACHER" ? "Teacher" : "Volunteer";
  await resend.emails.send({
    from: "camply@eleto.online",
    to: params.to,
    subject: `You're approved as a ${role} for ${params.campName}!`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="color:#E67E22;">Welcome to the team!</h1>
        <p>Hi ${params.name}, your ${role.toLowerCase()} registration for <strong>${params.campName}</strong> has been approved.</p>
        <p><a href="${params.dashboardUrl}">Go to your dashboard</a></p>
      </div>
    `,
  });
}

export async function sendStaffRejectedEmail(params: { to: string; name: string; campName: string; type: "TEACHER" | "VOLUNTEER"; reason?: string }) {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  const role = params.type === "TEACHER" ? "Teacher" : "Volunteer";
  await resend.emails.send({
    from: "camply@eleto.online",
    to: params.to,
    subject: `Update on your ${role.toLowerCase()} registration for ${params.campName}`,
    html: `<p>Hi ${params.name}, your ${role.toLowerCase()} registration for <strong>${params.campName}</strong> was not approved.</p>${params.reason ? `<p>Reason: ${params.reason}</p>` : ""}`,
  });
}
