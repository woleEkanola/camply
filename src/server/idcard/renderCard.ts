import { createCanvas, loadImage, type SKRSContext2D, type Image } from "@napi-rs/canvas";
import QRCode from "qrcode";

export interface CampIdCardData {
  camperName: string;
  campusName: string;
  gender: string | null;
  tribeName: string;
  tribeColor: string; // hex; fallback '#1E3A8A' applied by the caller if Tribe.color is null
  campName: string;
  campYear: string;
  logoUrl: string | null;
  qrToken: string;
}

// CR80 (85.60mm x 53.98mm) at 300 DPI — sharp at 1:1 print size, still crisp
// downscaled into a ~500-600px-wide email <img> on retina displays.
const CARD_WIDTH = 1011;
const CARD_HEIGHT = 638;
const CORNER_RADIUS = 32;

const ACCENT_COLOR = "#1D4ED8"; // fixed brand accent for camp name/year — stable regardless of tribe color
const MUTED_TEXT = "#6B7280";
const DARK_TEXT = "#0F172A";
const HAIRLINE = "#E2E8F0";

// ─── Layout constants (derived from the approved reference artwork, scaled
// from its 1568px width to this canvas's 1011px). Keeping them named and in
// one place makes the proportions auditable against that reference.
const HEADER_HEIGHT = 150;
const BAND_X = 496; // left edge of the tribe-colour band
const BAND_CORNER = 34; // radius of the band's rounded bottom-left corner
const BODY_X = 48;
const QR_BOX_SIZE = 440;
const QR_BOX_X = CARD_WIDTH - 40 - QR_BOX_SIZE;
const BODY_MAX_WIDTH = QR_BOX_X - BODY_X - 58; // gutter between text column and QR

function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
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
 * tribe name can't wrap cleanly inside a thin band, so the caller truncates
 * with an ellipsis if it's still too wide at `min`.
 */
function fitFontSize(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  opts: { start: number; min: number; step: number }
): number {
  let size = opts.start;
  ctx.font = `bold ${size}px sans-serif`;
  while (size > opts.min && ctx.measureText(text).width > maxWidth) {
    size -= opts.step;
    ctx.font = `bold ${size}px sans-serif`;
  }
  return size;
}

function truncateToFit(ctx: SKRSContext2D, text: string, maxWidth: number): string {
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
function wrapToLines(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] | null {
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
function fillTextTracked(ctx: SKRSContext2D, text: string, x: number, y: number, tracking: number) {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
}

/** Decorative halftone dot grid, fading along one axis — the reference's
 * bottom-left and in-band texture. */
function drawDotGrid(
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
function drawChurchGlyph(ctx: SKRSContext2D, cx: number, cy: number, size: number, discColor: string) {
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
function drawPersonGlyph(ctx: SKRSContext2D, cx: number, cy: number, size: number) {
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

async function loadLogoOrNull(url: string | null): Promise<Image | null> {
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export async function renderCampIdCardPng(data: CampIdCardData): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  const [logo, qrBuffer] = await Promise.all([
    loadLogoOrNull(data.logoUrl),
    QRCode.toBuffer(data.qrToken, { width: 600, margin: 1 }),
  ]);
  const qrImage = await loadImage(qrBuffer);

  // White background, clipped to the card's rounded outline so nothing
  // drawn afterward can bleed past the corners.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  roundRectPath(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // ─── Decorative halftone texture, bottom-left (behind everything else).
  // Hugs the left edge and stays faint so it never competes with the info
  // rows that sit just to its right.
  drawDotGrid(ctx, {
    x: 8, y: 424, width: 96, height: 210,
    spacing: 21, radius: 3.2, color: "#2563EB", fade: "toRight", maxAlpha: 0.5,
  });

  // ─── Tribe-colour band, top-right, with a rounded bottom-left corner so the
  // white header reads as a tab tucked beneath it (matches the reference).
  ctx.fillStyle = data.tribeColor;
  ctx.beginPath();
  ctx.moveTo(BAND_X, 0);
  ctx.lineTo(CARD_WIDTH, 0);
  ctx.lineTo(CARD_WIDTH, HEADER_HEIGHT);
  ctx.lineTo(BAND_X + BAND_CORNER, HEADER_HEIGHT);
  ctx.quadraticCurveTo(BAND_X, HEADER_HEIGHT, BAND_X, HEADER_HEIGHT - BAND_CORNER);
  ctx.closePath();
  ctx.fill();

  // Halftone texture inside the band's right end.
  ctx.save();
  ctx.beginPath();
  ctx.rect(BAND_X, 0, CARD_WIDTH - BAND_X, HEADER_HEIGHT);
  ctx.clip();
  drawDotGrid(ctx, {
    x: CARD_WIDTH - 232, y: 8, width: 232, height: HEADER_HEIGHT,
    spacing: 17, radius: 2.8, color: "#FFFFFF", fade: "toLeft",
  });
  ctx.restore();

  // Accent bar underlining the white header tab, meeting the band.
  ctx.fillStyle = ACCENT_COLOR;
  roundRectPath(ctx, 28, HEADER_HEIGHT - 9, BAND_X - 28, 9, 4.5);
  ctx.fill();

  // ─── Circular logo badge, top-left.
  const badgeCx = 95;
  const badgeCy = 76;
  const badgeR = 47;
  ctx.save();
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (logo) {
    ctx.drawImage(logo, badgeCx - badgeR, badgeCy - badgeR, badgeR * 2, badgeR * 2);
  } else {
    ctx.fillStyle = "#EFF6FF";
    ctx.fillRect(badgeCx - badgeR, badgeCy - badgeR, badgeR * 2, badgeR * 2);
    ctx.fillStyle = ACCENT_COLOR;
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(data.campName), badgeCx, badgeCy);
  }
  ctx.restore();
  ctx.strokeStyle = DARK_TEXT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // ─── Camp name + year, right of the logo badge, shrink-to-fit so long camp
  // names never collide with the vertical rule before the band.
  const campTextX = badgeCx + badgeR + 22;
  const campMaxWidth = BAND_X - 46 - campTextX;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DARK_TEXT;
  const campUpper = data.campName.toUpperCase();
  const campSize = fitFontSize(ctx, campUpper, campMaxWidth, { start: 38, min: 20, step: 2 });
  ctx.font = `bold ${campSize}px sans-serif`;
  ctx.fillText(truncateToFit(ctx, campUpper, campMaxWidth), campTextX, 84);
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(data.campYear, campTextX, 128);

  // Vertical hairline between the camp block and the band.
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(BAND_X - 30, 34);
  ctx.lineTo(BAND_X - 30, 118);
  ctx.stroke();

  // ─── Tribe name, centred in the band, shrink-to-fit.
  const bandInnerWidth = CARD_WIDTH - BAND_X - 56;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  const tribeUpper = data.tribeName.toUpperCase();
  const tribeSize = fitFontSize(ctx, tribeUpper, bandInnerWidth, { start: 60, min: 24, step: 2 });
  ctx.font = `bold ${tribeSize}px sans-serif`;
  ctx.fillText(
    truncateToFit(ctx, tribeUpper, bandInnerWidth),
    BAND_X + (CARD_WIDTH - BAND_X) / 2,
    HEADER_HEIGHT / 2 - 4
  );

  // ─── Camper name — the dominant element, wrapping to at most two lines.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DARK_TEXT;
  // Starts large enough that a typical two-part name stacks onto two lines,
  // matching the reference artwork's proportions.
  let nameSize = 92;
  let nameLines: string[] | null = null;
  while (nameSize >= 30) {
    ctx.font = `bold ${nameSize}px sans-serif`;
    nameLines = wrapToLines(ctx, data.camperName, BODY_MAX_WIDTH, 2);
    if (nameLines) break;
    nameSize -= 2;
  }
  if (!nameLines) {
    // A single unbreakable word wider than the column even at the floor size.
    nameSize = 30;
    ctx.font = `bold ${nameSize}px sans-serif`;
    nameLines = [truncateToFit(ctx, data.camperName, BODY_MAX_WIDTH)];
  }
  ctx.font = `bold ${nameSize}px sans-serif`;
  const nameLineHeight = Math.round(nameSize * 1.1);
  // Anchor the block so one- and two-line names share the same optical centre:
  // a short single-line name drops lower so the body doesn't sit top-heavy.
  const nameTop = nameLines.length >= 2 ? 232 : 278;
  nameLines.forEach((line, i) => {
    ctx.fillText(line, BODY_X, nameTop + i * nameLineHeight);
  });
  const nameBottom = nameTop + (nameLines.length - 1) * nameLineHeight;

  // Short accent rule under the name.
  const ruleY = nameBottom + 36;
  ctx.strokeStyle = ACCENT_COLOR;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(BODY_X, ruleY);
  ctx.lineTo(BODY_X + Math.min(BODY_MAX_WIDTH, 382), ruleY);
  ctx.stroke();

  // ─── Campus / Gender rows — solid accent disc + glyph, tracked label, bold value.
  function drawInfoRow(centerY: number, label: string, value: string, glyph: "church" | "person") {
    const discR = 24;
    const discCx = BODY_X + discR;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.beginPath();
    ctx.arc(discCx, centerY, discR, 0, Math.PI * 2);
    ctx.fill();
    if (glyph === "church") drawChurchGlyph(ctx, discCx, centerY, discR * 1.55, ACCENT_COLOR);
    else drawPersonGlyph(ctx, discCx, centerY, discR * 1.55);

    const textX = discCx + discR + 22;
    const valueMaxWidth = BODY_MAX_WIDTH - (textX - BODY_X);
    ctx.textAlign = "left";
    ctx.fillStyle = MUTED_TEXT;
    ctx.font = "bold 18px sans-serif";
    fillTextTracked(ctx, label.toUpperCase(), textX, centerY - 8, 1.6);
    ctx.fillStyle = DARK_TEXT;
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(truncateToFit(ctx, value, valueMaxWidth), textX, centerY + 24);
  }

  const campusRowY = ruleY + 56;
  drawInfoRow(campusRowY, "Campus", data.campusName, "church");

  const rowSeparatorY = campusRowY + 56;
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(BODY_X, rowSeparatorY);
  ctx.lineTo(BODY_X + Math.min(BODY_MAX_WIDTH, 382), rowSeparatorY);
  ctx.stroke();

  drawInfoRow(rowSeparatorY + 52, "Gender", data.gender ?? "—", "person");

  // ─── QR code: large rounded container on the right, vertically centred in
  // the body, with an inset quiet zone for scan reliability.
  const qrInset = 22;
  const qrSize = QR_BOX_SIZE - qrInset * 2;
  const qrBoxY = HEADER_HEIGHT + Math.round((CARD_HEIGHT - HEADER_HEIGHT - QR_BOX_SIZE) / 2);

  roundRectPath(ctx, QR_BOX_X, qrBoxY, QR_BOX_SIZE, QR_BOX_SIZE, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = ACCENT_COLOR;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.drawImage(qrImage, QR_BOX_X + qrInset, qrBoxY + qrInset, qrSize, qrSize);

  ctx.restore(); // undo the card-outline clip

  // Faint cut guide tracing the card's exact outline, so a printed sheet can
  // be trimmed accurately. Drawn after the clip is released (a stroke inside
  // the clip would lose its outer half) and kept light enough not to read as
  // part of the design on screen.
  roundRectPath(ctx, 1.5, 1.5, CARD_WIDTH - 3, CARD_HEIGHT - 3, CORNER_RADIUS - 1);
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 3;
  ctx.stroke();

  return canvas.encode("png");
}
