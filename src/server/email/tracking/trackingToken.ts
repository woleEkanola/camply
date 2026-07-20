const SECRET = process.env.NEXTAUTH_SECRET || "camply-tracking-secret";

function encode(obj: Record<string, string>): string {
  const json = JSON.stringify(obj);
  const encoded = Buffer.from(json).toString("base64url");
  const check = simpleHash(json);
  return `${encoded}.${check}`;
}

function decode<T extends Record<string, string>>(token: string): T | null {
  try {
    const [encoded, check] = token.split(".");
    if (!encoded || !check) return null;
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    if (simpleHash(json) !== check) return null;
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function simpleHash(input: string): string {
  let hash = 0;
  const combined = input + SECRET;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
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
