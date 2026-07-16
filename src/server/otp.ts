import crypto from "crypto";

export const MAX_OTP_ATTEMPTS = 5;

/**
 * Strips everything but digits from a user-submitted OTP code. Codes are
 * generated as clean 6-digit strings, but a pasted code can pick up
 * whitespace (a trailing space is common when copying from an email/SMS) —
 * without this, otpEqual's length check rejects an otherwise-correct code.
 * Only apply this to the submitted code, never to the stored one.
 */
export function normalizeOtp(code: string): string {
  return code.replace(/\D/g, "");
}

/** Constant-time comparison of two OTP codes. */
export function otpEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
