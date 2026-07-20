import { generateOpenToken, generateClickToken } from "./trackingToken";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

/**
 * Injects open/click tracking into a rendered campaign email:
 * - every http(s) link is wrapped in our click-redirect endpoint
 * - a 1x1 tracking pixel is appended before </body> (or at the end)
 *
 * Tokens are HMAC-signed (see trackingToken.ts) so recipients can't forge
 * open/click events for other people.
 */
export function injectTracking(
  html: string,
  params: { recipientId: string; campaignId: string }
): string {
  const rewritten = html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url: string) => {
    if (url.includes("/api/track/")) return match; // never double-wrap
    const token = generateClickToken(params.recipientId, params.campaignId, url);
    return `href="${APP_URL}/api/track/click/${token}"`;
  });

  const openToken = generateOpenToken(params.recipientId, params.campaignId);
  const pixel = `<img src="${APP_URL}/api/track/open/${openToken}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;

  if (rewritten.includes("</body>")) {
    return rewritten.replace("</body>", `${pixel}</body>`);
  }
  return rewritten + pixel;
}
