import { Resend } from 'resend';

let resend: Resend | null = null;

export async function sendWelcomeEmail(email: string, firstName: string, verifyToken: string, orgSlug?: string) {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      console.log("[RESEND] No API key configured — skipping welcome email");
      return;
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  const from = orgSlug ? `${orgSlug}@camply.ng` : 'donotreply@camply.ng';
  const verifyUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3001'}/api/auth/verify-email?token=${verifyToken}`;
  
  try {
    const result = await resend.emails.send({
      from,
      to: email,
      subject: 'Welcome to Camply — verify your email',
      html: `
        <h1>Welcome to Camply, ${firstName}!</h1>
        <p>Your account has been created. Please verify your email address by clicking the link below:</p>
        <p><a href="${verifyUrl}">Verify your email</a></p>
        <p>Or copy and paste this link into your browser:</p>
        <p>${verifyUrl}</p>
        <p>Once verified, you'll be able to complete your camper's registration.</p>
      `,
    });
    console.log("[RESEND] Welcome email result", result.error ? `Error: ${result.error.message}` : `OK id=${result.data?.id}`);
  } catch (err) {
    console.error("[RESEND] Failed to send welcome email:", err);
  }
}
