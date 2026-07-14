import { Resend } from 'resend';
import { buildFromAddress } from './fromAddress';

let resend: Resend | null = null;

export async function sendOtpEmail(email: string, otp: string, orgSlug?: string) {
  if (!resend) {
    console.log("[RESEND] Initializing Resend client");
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  const from = buildFromAddress({ orgSlug });
  console.log("[RESEND] Sending OTP email to", email, "from", from);
  const result = await resend.emails.send({
    from,
    to: email,
    subject: 'Your OTP Code',
    text: `Your OTP code is: ${otp}`,
    html: `<p>Your OTP code is: <b>${otp}</b></p>`,
  });
  console.log("[RESEND] Send result", result.error ? `Error: ${result.error.message}` : `OK id=${result.data?.id}`);
}
