import { Resend } from "resend";

let resend: Resend | null = null;

export async function sendTestEmail(to: string, orgSlug?: string) {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  const from = orgSlug ? `${orgSlug}@camply.ng` : 'donotreply@camply.ng';
  console.log("[TEST-EMAIL] Sending test email to", to, "from", from);
  const result = await resend.emails.send({
    from,
    to,
    subject: "Test Email from Camply",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="color:#E67E22;">Test Email</h1>
        <p>If you're reading this, Camply's email system is working correctly.</p>
        <p style="color: #888; font-size: 12px;">Sent from Super Admin dashboard</p>
      </div>
    `,
  });
  console.log("[TEST-EMAIL] Result", result.error ? `Error: ${result.error.message}` : `OK id=${result.data?.id}`);
}
