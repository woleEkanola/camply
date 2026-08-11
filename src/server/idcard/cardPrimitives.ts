import { createCanvas, loadImage, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import { registerFont } from "@napi-rs/canvas/node-canvas";
import { join } from "path";

const FONTS_DIR = join(process.cwd(), "public/fonts");
registerFont(join(FONTS_DIR, "Inter-Regular.woff2"), { family: "Inter" });
registerFont(join(FONTS_DIR, "Inter-Bold.woff2"), { family: "Inter", weight: "bold" });

// CR80 (85.60mm x 53.98mm) at 300 DPI — sharp at 1:1 print size, still crisp
// downscaled into a ~500-600px-wide email <img> on retina displays.
export const CARD_WIDTH = 1011;
export const CARD_HEIGHT = 638;
export const CORNER_RADIUS = 32;

export const ACCENT_COLOR = "#1D4ED8"; // fixed brand accent for camp name/year — stable regardless of tribe/role color
export const MUTED_TEXT = "#6B7280";
export const DARK_TEXT = "#0F172A";
export const HAIRLINE = "#E2E8F0";

// ─── Layout constants (derived from the approved reference artwork, scaled
// from its 1568px width to this canvas's 1011px). Keeping them named and in
// one place makes the proportions auditable against that reference.
export const HEADER_HEIGHT = 150;
export const BAND_X = 496; // left edge of the colour band
export const BAND_CORNER = 34; // radius of the band's rounded bottom-left corner
export const BODY_X = 48;
export const QR_BOX_SIZE = 440;
export const QR_BOX_X = CARD_WIDTH - 40 - QR_BOX_SIZE;
export const BODY_MAX_WIDTH = QR_BOX_X - BODY_X - 58; // gutter between text column and QR

export function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Shrinks `text` to the largest bold font size in [min, start] (step
 * decrements) that fits within maxWidth on a single line. Never wraps — the
 * caller truncates with an ellipsis if it's still too wide at `min`.
 */
export function fitFontSize(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  opts: { start: number; min: number; step: number }
): number {
  let size = opts.start;
  ctx.font = `bold ${size}px Inter, sans-serif`;
  while (size > opts.min && ctx.measureText(text).width > maxWidth) {
    size -= opts.step;
    ctx.font = `bold ${size}px Inter, sans-serif`;
  }
  return size;
}

export function truncateToFit(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + "…").width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "…";
}

/** Greedy word wrap at the ctx's current font. Returns null when the text
 * needs more than `maxLines` lines, or when any single word overflows —
 * the caller steps the font size down and retries. */
export function wrapToLines(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) return null;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) return null;
  // A single word wider than the column can't be fixed by wrapping.
  if (lines.some((line) => ctx.measureText(line).width > maxWidth)) return null;
  return lines;
}

/** Canvas has no letter-spacing we can rely on across versions — draw the
 * small uppercase labels glyph by glyph so they match the reference's
 * tracked-out look. */
export function fillTextTracked(ctx: SKRSContext2D, text: string, x: number, y: number, tracking: number) {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
}

/** Decorative halftone dot grid, fading along one axis — the reference's
 * bottom-left and in-band texture. */
export function drawDotGrid(
  ctx: SKRSContext2D,
  opts: {
    x: number; y: number; width: number; height: number;
    spacing: number; radius: number; color: string;
    fade: "toRight" | "toLeft" | "toTop";
    maxAlpha?: number;
  }
) {
  const cols = Math.ceil(opts.width / opts.spacing);
  const rows = Math.ceil(opts.height / opts.spacing);
  const maxAlpha = opts.maxAlpha ?? 1;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cx = opts.x + c * opts.spacing;
      const cy = opts.y + r * opts.spacing;
      let t: number;
      if (opts.fade === "toRight") t = 1 - c / cols;
      else if (opts.fade === "toLeft") t = c / cols;
      else t = r / rows;
      t *= maxAlpha;
      if (t <= 0.02) continue;
      ctx.globalAlpha = t;
      ctx.fillStyle = opts.color;
      ctx.beginPath();
      ctx.arc(cx, cy, opts.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Simplified church glyph (cross + roof + body), white on an accent disc. */
export function drawChurchGlyph(ctx: SKRSContext2D, cx: number, cy: number, size: number, discColor: string) {
  const u = size / 24;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(cx - u, cy - u * 12, u * 2, u * 6);
  ctx.fillRect(cx - u * 3, cy - u * 10, u * 6, u * 2);
  ctx.beginPath();
  ctx.moveTo(cx, cy - u * 6);
  ctx.lineTo(cx + u * 8, cy + u * 1);
  ctx.lineTo(cx - u * 8, cy + u * 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - u * 6, cy + u * 1, u * 12, u * 9);
  ctx.fillStyle = discColor;
  ctx.fillRect(cx - u * 2, cy + u * 4, u * 4, u * 6);
}

/** Simplified person glyph (head + shoulders), white on an accent disc. */
export function drawPersonGlyph(ctx: SKRSContext2D, cx: number, cy: number, size: number) {
  const u = size / 24;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(cx, cy - u * 5, u * 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + u * 10, u * 8, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

/** Simplified briefcase glyph (department), white on an accent disc. */
export function drawBriefcaseGlyph(ctx: SKRSContext2D, cx: number, cy: number, size: number) {
  const u = size / 24;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(cx - u * 3, cy - u * 10, u * 6, u * 3);
  roundRectPath(ctx, cx - u * 9, cy - u * 6, u * 18, u * 14, u * 2);
  ctx.fill();
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(cx - u * 2, cy - u * 1, u * 4, u * 3);
}

/** Simplified shield glyph (tribe/leadership), white on an accent disc. */
export function drawShieldGlyph(ctx: SKRSContext2D, cx: number, cy: number, size: number) {
  const u = size / 24;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(cx, cy - u * 11);
  ctx.lineTo(cx + u * 8, cy - u * 7);
  ctx.lineTo(cx + u * 8, cy + u * 2);
  ctx.quadraticCurveTo(cx + u * 8, cy + u * 10, cx, cy + u * 13);
  ctx.quadraticCurveTo(cx - u * 8, cy + u * 10, cx - u * 8, cy + u * 2);
  ctx.lineTo(cx - u * 8, cy - u * 7);
  ctx.closePath();
  ctx.fill();
}

export async function loadLogoOrNull(url: string | null): Promise<Image | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch {
    return null;
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export { createCanvas, loadImage };
export type { SKRSContext2D, Image };
