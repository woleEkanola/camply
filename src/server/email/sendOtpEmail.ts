import { Resend } from 'resend';

let resend: Resend | null = null;

export async function sendOtpEmail(email: string, otp: string) {
  if (!resend) {
    console.log("[RESEND] Initializing Resend client");
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  console.log("[RESEND] Sending OTP email to", email);
  const result = await resend.emails.send({
    from: 'donotreply@camply.ng',
    to: email,
    subject: 'Your OTP Code',
    text: `Your OTP code is: ${otp}`,
    html: `<p>Your OTP code is: <b>${otp}</b></p>`,
  });
  console.log("[RESEND] Send result", result.error ? `Error: ${result.error.message}` : `OK id=${result.data?.id}`);
}
