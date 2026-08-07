import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

/** QR code for a leaderboard's public share URL (/l/[token], see PR4's
 * publicBoard route). Public by design — the token itself is the secret,
 * same trust model as the URL it encodes; this route holds no additional
 * auth beyond "you already have a valid, enabled token". */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = req.nextUrl.origin;
  const publicUrl = `${origin}/l/${token}`;

  const pngBuffer = await QRCode.toBuffer(publicUrl, { width: 300, margin: 1 });

  return new NextResponse(pngBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
    },
  });
}
