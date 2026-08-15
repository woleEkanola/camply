import crypto from "crypto";

export function verifyResendWebhookSignature(payload: string, headers: Headers, secret: string): boolean {
  try {
    const messageId = headers.get("svix-id");
    const timestamp = headers.get("svix-timestamp");
    const signatures = headers.get("svix-signature")?.split(" ").map((part) => part.split(",")).filter(([version, value]) => version === "v1" && value) ?? [];
    if (!messageId || !timestamp || signatures.length === 0) return false;
    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
    const secretBytes = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    const expected = crypto.createHmac("sha256", secretBytes).update(`${messageId}.${timestamp}.${payload}`).digest("base64");
    return signatures.some(([, value]) => {
      const actual = Buffer.from(value, "utf8");
      const expectedBuffer = Buffer.from(expected, "utf8");
      return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
    });
  } catch {
    return false;
  }
}
