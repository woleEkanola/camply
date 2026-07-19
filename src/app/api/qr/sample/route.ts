import { NextResponse } from "next/server";
import QRCode from "qrcode";

/**
 * Fixed demo QR image for the template-editor "Send Test Email" flow. That
 * flow emails real recipients via Resend using sample data (no real
 * registration exists yet to build a token URL from) — email clients strip
 * data: URIs just like the real acceptance-email bug this mirrors, so the
 * sample QR needs a real hosted image too, not a data: URI.
 *
 * A literal sibling path takes precedence over the [token] dynamic route,
 * so this never collides with a real qrToken lookup.
 */
export async function GET() {
  const pngBuffer = await QRCode.toBuffer("SAMPLE-PREVIEW-QR", { width: 300, margin: 1 });

  return new NextResponse(pngBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
