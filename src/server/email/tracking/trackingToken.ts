import crypto from "crypto";

// Lazily asserted so importing this module (e.g. in tests) never crashes, but
// actually minting/verifying tokens without the secret fails loud — a silent
// fallback secret in the repo would let anyone forge open/click events.
function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is required for email tracking tokens");
  return s;
}

function encode(obj: Record<string, string>): string {
  const json = JSON.stringify(obj);
  const encoded = Buffer.from(json).toString("base64url");
  const check = crypto.createHmac("sha256", secret()).update(json).digest("base64url");
  return `${encoded}.${check}`;
}

function decode<T extends Record<string, string>>(token: string): T | null {
  try {
    const [encoded, check] = token.split(".");
    if (!encoded || !check) return null;
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    const expected = crypto.createHmac("sha256", secret()).update(json).digest("base64url");
    if (check !== expected) return null;
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function generateOpenToken(
  recipientId: string,
  campaignId: string
): string {
  return encode({ recipientId, campaignId, type: "open" });
}

export function generateClickToken(
  recipientId: string,
  campaignId: string,
  url: string
): string {
  return encode({ recipientId, campaignId, url, type: "click" });
}

export function decodeOpenToken(
  token: string
): { recipientId: string; campaignId: string } | null {
  const decoded = decode<{
    recipientId: string;
    campaignId: string;
    type: string;
  }>(token);
  if (decoded && decoded.type === "open") {
    return { recipientId: decoded.recipientId, campaignId: decoded.campaignId };
  }
  return null;
}

export function decodeClickToken(
  token: string
): { recipientId: string; campaignId: string; url: string } | null {
  const decoded = decode<{
    recipientId: string;
    campaignId: string;
    url: string;
    type: string;
  }>(token);
  if (decoded && decoded.type === "click") {
    return {
      recipientId: decoded.recipientId,
      campaignId: decoded.campaignId,
      url: decoded.url,
    };
  }
  return null;
}
