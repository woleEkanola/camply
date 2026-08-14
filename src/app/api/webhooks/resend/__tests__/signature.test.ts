import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyResendWebhookSignature } from "../../../../../server/email/webhooks/verifyResend";

function signedHeaders(payload: string, secretBytes: Buffer, timestamp = Math.floor(Date.now() / 1000)) {
  const id = "msg_test_123";
  const signature = crypto.createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return new Headers({ "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` });
}

describe("Resend webhook signature verification", () => {
  const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email_1" } });
  const secretBytes = crypto.randomBytes(32);
  const secret = `whsec_${secretBytes.toString("base64")}`;

  it("accepts a current Svix signature", () => {
    expect(verifyResendWebhookSignature(payload, signedHeaders(payload, secretBytes), secret)).toBe(true);
  });

  it("rejects tampered payloads and replayed timestamps", () => {
    expect(verifyResendWebhookSignature(`${payload} `, signedHeaders(payload, secretBytes), secret)).toBe(false);
    const stale = Math.floor(Date.now() / 1000) - 601;
    expect(verifyResendWebhookSignature(payload, signedHeaders(payload, secretBytes, stale), secret)).toBe(false);
  });
});
