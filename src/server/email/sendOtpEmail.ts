import { Resend } from 'resend';

let resend: Resend | null = null;

export async function sendOtpEmail(email: string, otp: string) {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  await resend.emails.send({
    from: 'camply@eleto.online',
    to: email,
    subject: 'Your OTP Code',
    text: `Your OTP code is: ${otp}`,
    html: `<p>Your OTP code is: <b>${otp}</b></p>`,
  });
}
