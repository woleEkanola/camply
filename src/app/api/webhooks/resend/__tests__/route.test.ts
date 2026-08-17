import crypto from "crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { POST } from "../route";

/**
 * Exercises the webhook route handler itself, not just its signature verifier.
 * This is the only path that writes `deliveredAt` and `bouncedAt`, so every
 * delivery and bounce statistic in the app depends on these transitions being
 * right — and none of them were covered before.
 */

const prisma = new PrismaClient();

const secretBytes = crypto.randomBytes(32);
const SECRET = `whsec_${secretBytes.toString("base64")}`;

let orgId: string;
let userId: string;
let campaignId: string;
let recipientId: string;
let messageId: string;

function signedRequest(payload: unknown, opts?: { secret?: Buffer; timestamp?: number }) {
  const body = JSON.stringify(payload);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = opts?.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", opts?.secret ?? secretBytes)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  return new NextRequest("http://localhost:3001/api/webhooks/resend", {
    method: "POST",
    body,
    headers: new Headers({
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${signature}`,
    }),
  });
}

async function post(type: string, extra: Record<string, unknown> = {}) {
  const request = signedRequest({ type, data: { email_id: messageId, ...extra } });
  return POST(request);
}

function recipient() {
  return prisma.emailRecipient.findUniqueOrThrow({ where: { id: recipientId } });
}

/** Reset the row to a chosen point in the pipeline. */
async function setState(data: Record<string, unknown>) {
  await prisma.emailRecipient.update({
    where: { id: recipientId },
    data: { deliveredAt: null, openedAt: null, clickedAt: null, bouncedAt: null, ...data },
  });
}

beforeEach(async () => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;

  const org = await prisma.organization.create({ data: { name: `Webhook Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: {
      email: `e2e-webhook-${Date.now()}-${Math.random().toString(36).slice(2)}@camply.test`,
      firstName: "Webhook",
      lastName: "Target",
      role: "PARENT",
      password: "not-used-by-these-tests",
      organizationId: orgId,
    },
  });
  userId = user.id;

  const campaign = await prisma.emailCampaign.create({
    data: { organizationId: orgId, name: "Webhook campaign", subject: "Hello", body: {}, status: "SENDING", createdById: userId },
  });
  campaignId = campaign.id;

  messageId = `resend_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const created = await prisma.emailRecipient.create({
    data: {
      campaignId,
      organizationId: orgId,
      userId,
      email: user.email,
      recipientType: "PARENT",
      deliveryStatus: "SENT",
      sentAt: new Date(),
      providerMessageId: messageId,
    },
  });
  recipientId = created.id;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.emailRecipient.deleteMany({ where: { organizationId: orgId } });
  await prisma.emailCampaign.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Resend webhook route — authentication", () => {
  it("rejects and logs loudly when the signing secret is not configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post("email.delivered");

    expect(response.status).toBe(401);
    // A silently-misconfigured deployment is exactly how delivery stats ended up
    // stuck at 0% — the operator must be able to see this in the logs.
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("RESEND_WEBHOOK_SECRET is not set"));
    // And nothing was written.
    expect((await recipient()).deliveredAt).toBeNull();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const request = signedRequest(
      { type: "email.delivered", data: { email_id: messageId } },
      { secret: crypto.randomBytes(32) }
    );
    const response = await POST(request);

    expect(response.status).toBe(401);
    expect((await recipient()).deliveredAt).toBeNull();
  });

  it("accepts a correctly signed event", async () => {
    const response = await post("email.delivered");
    expect(response.status).toBe(200);
  });
});

describe("Resend webhook route — status transitions", () => {
  it("records email.sent", async () => {
    await setState({ deliveryStatus: "QUEUED", sentAt: null });
    await post("email.sent");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("SENT");
    expect(row.sentAt).not.toBeNull();
  });

  it("records email.delivered", async () => {
    await post("email.delivered");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("DELIVERED");
    expect(row.deliveredAt).not.toBeNull();
    expect(row.failedReason).toBeNull();
  });

  it("records email.opened", async () => {
    await setState({ deliveryStatus: "DELIVERED", deliveredAt: new Date() });
    await post("email.opened");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("OPENED");
    expect(row.openedAt).not.toBeNull();
  });

  it("records email.clicked and backfills the open", async () => {
    await setState({ deliveryStatus: "DELIVERED", deliveredAt: new Date() });
    await post("email.clicked");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("CLICKED");
    expect(row.clickedAt).not.toBeNull();
    // A click implies an open, even when the pixel was blocked.
    expect(row.openedAt).not.toBeNull();
  });

  it("records email.bounced", async () => {
    await post("email.bounced");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("BOUNCED");
    expect(row.bouncedAt).not.toBeNull();
  });

  it("records email.failed, suppressed and complained as FAILED", async () => {
    for (const type of ["email.failed", "email.suppressed", "email.complained"]) {
      await setState({ deliveryStatus: "SENT" });
      await post(type);

      const row = await recipient();
      expect(row.deliveryStatus).toBe("FAILED");
      expect(row.failedReason).toContain(type.replace("email.", ""));
    }
  });

  it("records email.delivery_delayed", async () => {
    await post("email.delivery_delayed");
    expect((await recipient()).deliveryStatus).toBe("DELAYED");
  });

  it("ignores unknown event types without erroring", async () => {
    const response = await post("email.something_new");
    expect(response.status).toBe(200);
    expect((await recipient()).deliveryStatus).toBe("SENT");
  });
});

describe("Resend webhook route — out-of-order events", () => {
  it("stamps deliveredAt on an already-OPENED row without regressing the status", async () => {
    // The regression this covers: the tracking pixel routinely flips a row to
    // OPENED before Resend's delivered event lands, and the old single guarded
    // update dropped deliveredAt permanently — leaving rows that were opened but
    // never "delivered", which zeroed the delivered count.
    await setState({ deliveryStatus: "OPENED", openedAt: new Date() });

    await post("email.delivered");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("OPENED"); // never regressed
    expect(row.deliveredAt).not.toBeNull(); // but the fact was still recorded
  });

  it("stamps bouncedAt on an already-OPENED row without regressing the status", async () => {
    await setState({ deliveryStatus: "OPENED", openedAt: new Date() });

    await post("email.bounced");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("OPENED");
    expect(row.bouncedAt).not.toBeNull();
  });

  it("does not downgrade CLICKED to OPENED", async () => {
    const clickedAt = new Date("2026-08-01T10:00:00Z");
    await setState({ deliveryStatus: "CLICKED", openedAt: clickedAt, clickedAt });

    await post("email.opened");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("CLICKED");
    expect(row.openedAt?.toISOString()).toBe(clickedAt.toISOString());
  });

  it("does not overwrite a real earlier open with the click time", async () => {
    const openedAt = new Date("2026-08-01T10:00:00Z");
    await setState({ deliveryStatus: "OPENED", openedAt });

    await post("email.clicked");

    const row = await recipient();
    expect(row.deliveryStatus).toBe("CLICKED");
    // The genuine first-open timestamp survives — it is when they actually read it.
    expect(row.openedAt?.toISOString()).toBe(openedAt.toISOString());
    expect(row.clickedAt).not.toBeNull();
  });

  it("does not resurrect a delivered row via a late failure event", async () => {
    await setState({ deliveryStatus: "DELIVERED", deliveredAt: new Date() });

    await post("email.failed");

    expect((await recipient()).deliveryStatus).toBe("DELIVERED");
  });

  it("is idempotent — a replayed delivered event keeps the first timestamp", async () => {
    await post("email.delivered");
    const first = (await recipient()).deliveredAt;

    await post("email.delivered");

    expect((await recipient()).deliveredAt?.toISOString()).toBe(first?.toISOString());
  });
});

describe("Resend webhook route — error handling", () => {
  it("warns when an event matches no recipient", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const request = signedRequest({ type: "email.delivered", data: { email_id: "resend_never_stored" } });
    const response = await POST(request);

    expect(response.status).toBe(200);
    // A miss means we never stored that providerMessageId — silently counting
    // zero here is how delivery stats drift out of step with reality.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("matched no EmailRecipient"));
  });

  it("returns 200 for a payload with no email_id", async () => {
    const request = signedRequest({ type: "email.delivered", data: {} });
    expect((await POST(request)).status).toBe(200);
  });

  it("returns 500 so the provider retries when processing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Malformed JSON body with a valid signature over it.
    const body = "{not json";
    const id = "msg_bad";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${body}`).digest("base64");
    const request = new NextRequest("http://localhost:3001/api/webhooks/resend", {
      method: "POST",
      body,
      headers: new Headers({
        "svix-id": id,
        "svix-timestamp": String(timestamp),
        "svix-signature": `v1,${signature}`,
      }),
    });

    // Previously this returned 200, so Resend never retried and the event was
    // lost for good.
    expect((await POST(request)).status).toBe(500);
  });
});
