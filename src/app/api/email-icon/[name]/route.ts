import { NextResponse } from "next/server";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import { ICON_PATHS, isEmailIconName } from "@/server/email/icons";

/**
 * Rasterizes a registry icon to PNG for use in emails.
 *
 * Email clients strip inline <svg> (Gmail and Outlook.com drop it entirely),
 * so certificate emails reference icons as hosted <img> instead — the same
 * fix the QR code needed when data: URIs turned out to be stripped too
 * (see api/qr/sample/route.ts). Public and unauthenticated by design:
 * mail clients send no cookies, and there is nothing private here.
 *
 * Input is bounded — the name must exist in ICON_PATHS, the colour must be
 * 6 hex digits, and the size must be one of a small allowlist — so no
 * caller-supplied geometry or arbitrary dimensions reach the canvas.
 */

const VIEWBOX = 24;
const ALLOWED_SIZES = [12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48];
const DEFAULT_SIZE = 16;
const DEFAULT_COLOR = "16A34A"; // theme.color.success
const HEX = /^[0-9A-Fa-f]{6}$/;
/** Rasterize at 2x so the icons stay sharp on retina screens and in print. */
const SCALE = 2;

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (!isEmailIconName(name)) {
    return NextResponse.json({ error: "Unknown icon" }, { status: 404 });
  }
  const icon = ICON_PATHS[name];

  const url = new URL(req.url);
  const rawColor = (url.searchParams.get("c") ?? "").replace(/^#/, "");
  const color = `#${HEX.test(rawColor) ? rawColor : DEFAULT_COLOR}`;

  const rawSize = Number(url.searchParams.get("s"));
  const size = ALLOWED_SIZES.includes(rawSize) ? rawSize : DEFAULT_SIZE;

  const canvas = createCanvas(size * SCALE, size * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale((size * SCALE) / VIEWBOX, (size * SCALE) / VIEWBOX);

  if (icon.mode === "fill") {
    ctx.fillStyle = color;
    for (const d of icon.d) ctx.fill(new Path2D(d));
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5; // matches Heroicons-outline strokeWidth
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const d of icon.d) ctx.stroke(new Path2D(d));
  }

  const png = canvas.toBuffer("image/png");

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Output is fully determined by the URL, so this can outlive the QR
      // route's 24h window.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
