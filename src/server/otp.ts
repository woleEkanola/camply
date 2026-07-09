import crypto from "crypto";

export const MAX_OTP_ATTEMPTS = 5;

/** Constant-time comparison of two OTP codes. */
export function otpEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
