import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  generateOpenToken,
  generateClickToken,
  decodeOpenToken,
  decodeClickToken,
} from "../tracking/trackingToken";
import { injectTracking } from "../tracking/injectTracking";

const SECRET = "test-secret-for-tracking";

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.NEXTAUTH_SECRET;
});

describe("trackingToken", () => {
  it("round-trips an open token", () => {
    const token = generateOpenToken("rec_1", "camp_1");
    expect(decodeOpenToken(token)).toEqual({ recipientId: "rec_1", campaignId: "camp_1" });
  });

  it("round-trips a click token including the target url", () => {
    const token = generateClickToken("rec_1", "camp_1", "https://camply.ng/dashboard?x=1&y=2");
    expect(decodeClickToken(token)).toEqual({
      recipientId: "rec_1",
      campaignId: "camp_1",
      url: "https://camply.ng/dashboard?x=1&y=2",
    });
  });

  it("rejects a tampered payload", () => {
    const token = generateOpenToken("rec_1", "camp_1");
    const [encoded, check] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ recipientId: "rec_EVIL", campaignId: "camp_1", type: "open" })).toString("base64url");
    expect(decodeOpenToken(`${forged}.${check}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = generateOpenToken("rec_1", "camp_1");
    process.env.NEXTAUTH_SECRET = "other-secret";
    expect(decodeOpenToken(token)).toBeNull();
  });

  it("rejects open tokens decoded as click tokens and vice versa", () => {
    const openToken = generateOpenToken("rec_1", "camp_1");
    const clickToken = generateClickToken("rec_1", "camp_1", "https://x.ng");
    expect(decodeClickToken(openToken)).toBeNull();
    expect(decodeOpenToken(clickToken)).toBeNull();
  });

  it("throws when NEXTAUTH_SECRET is missing (no forgeable fallback)", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => generateOpenToken("rec_1", "camp_1")).toThrow("NEXTAUTH_SECRET");
  });
});

describe("injectTracking", () => {
  it("wraps http(s) links with click-tracking URLs and appends a pixel", () => {
    const html = '<html><body><p>Hi</p><a href="https://camply.ng/dashboard">Go</a></body></html>';
    const out = injectTracking(html, { recipientId: "rec_1", campaignId: "camp_1" });

    expect(out).toContain("/api/track/click/");
    expect(out).not.toContain('href="https://camply.ng/dashboard"');
    expect(out).toContain("/api/track/open/");
    expect(out.indexOf("/api/track/open/")).toBeLessThan(out.indexOf("</body>"));
    expect(out).toContain("</body>");
  });

  it("never double-wraps tracking URLs", () => {
    const html = '<body><a href="https://camply.ng/api/track/open/abc">x</a></body>';
    const out = injectTracking(html, { recipientId: "rec_1", campaignId: "camp_1" });
    const occurrences = out.split("/api/track/").length - 1;
    // one pre-existing link (unwrapped) + one pixel = 2, not 3
    expect(occurrences).toBe(2);
  });

  it("leaves mailto: and non-http links untouched", () => {
    const html = '<body><a href="mailto:x@y.ng">mail</a><a href="#anchor">jump</a></body>';
    const out = injectTracking(html, { recipientId: "rec_1", campaignId: "camp_1" });
    expect(out).toContain('href="mailto:x@y.ng"');
    expect(out).toContain('href="#anchor"');
  });

  it("appends the pixel even when the html has no </body>", () => {
    const out = injectTracking("<p>fragment</p>", { recipientId: "rec_1", campaignId: "camp_1" });
    expect(out).toContain("/api/track/open/");
    expect(out.endsWith("/>")).toBe(true);
  });
});
