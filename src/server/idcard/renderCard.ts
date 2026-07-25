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
const DARK_TEXT = "#111827";

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
 * decrements) that fits within maxWidth on a single line. Never wraps —
 * camp/tribe/camper names can't wrap cleanly in a thin band, so the caller
 * truncates with an ellipsis if it's still too wide at `min`.
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
    QRCode.toBuffer(data.qrToken, { width: 300, margin: 1 }),
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

  // Tribe-color header band, top-right, full header height.
  const headerHeight = 150;
  const bandX = 360;
  ctx.fillStyle = data.tribeColor;
  ctx.fillRect(bandX, 0, CARD_WIDTH - bandX, headerHeight);

  // Decorative diagonal accent curve, purely cosmetic, fixed control points.
  ctx.strokeStyle = "rgba(37, 99, 235, 0.25)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 168);
  ctx.quadraticCurveTo(CARD_WIDTH / 2, 198, CARD_WIDTH, 176);
  ctx.stroke();

  // Circular logo badge, top-left.
  const badgeCx = 88;
  const badgeCy = 76;
  const badgeR = 56;
  ctx.save();
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (logo) {
    ctx.drawImage(logo, badgeCx - badgeR, badgeCy - badgeR, badgeR * 2, badgeR * 2);
  } else {
    ctx.fillStyle = "#E5E7EB";
    ctx.fillRect(badgeCx - badgeR, badgeCy - badgeR, badgeR * 2, badgeR * 2);
    ctx.fillStyle = MUTED_TEXT;
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(data.campName), badgeCx, badgeCy);
  }
  ctx.restore();
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // Camp name + year, right of the logo badge.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DARK_TEXT;
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(data.campName.toUpperCase(), badgeCx + badgeR + 20, badgeCy - 4);
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(data.campYear, badgeCx + badgeR + 20, badgeCy + 32);

  // Tribe name, shrink-to-fit inside the header band.
  const bandPadding = 32;
  const bandMaxWidth = CARD_WIDTH - bandX - bandPadding * 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  const tribeUpper = data.tribeName.toUpperCase();
  const tribeSize = fitFontSize(ctx, tribeUpper, bandMaxWidth, { start: 42, min: 22, step: 2 });
  ctx.font = `bold ${tribeSize}px sans-serif`;
  const tribeDisplay = truncateToFit(ctx, tribeUpper, bandMaxWidth);
  ctx.fillText(tribeDisplay, bandX + bandPadding, headerHeight / 2);

  // Reserve the right third for the QR code (drawn last, over the body).
  const qrZoneX = 700;
  const qrZoneWidth = CARD_WIDTH - qrZoneX - 24;
  const qrZoneY = headerHeight + 24;
  const qrZoneHeight = CARD_HEIGHT - qrZoneY - 24;

  // Camper name — largest text on the card, shrink-to-fit, body width minus QR zone.
  const bodyX = 48;
  const bodyMaxWidth = qrZoneX - bodyX - 24;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DARK_TEXT;
  const nameSize = fitFontSize(ctx, data.camperName, bodyMaxWidth, { start: 48, min: 28, step: 2 });
  ctx.font = `bold ${nameSize}px sans-serif`;
  const nameDisplay = truncateToFit(ctx, data.camperName, bodyMaxWidth);
  const nameY = headerHeight + 80;
  ctx.fillText(nameDisplay, bodyX, nameY);

  // Thin separator under the camper name.
  ctx.strokeStyle = "#D1D5DB";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bodyX, nameY + 24);
  ctx.lineTo(bodyX + bodyMaxWidth, nameY + 24);
  ctx.stroke();

  // Campus / Gender rows — small filled circle "icon", label + value.
  function drawInfoRow(y: number, label: string, value: string) {
    const iconR = 14;
    const iconCx = bodyX + iconR;
    ctx.fillStyle = "#DBEAFE";
    ctx.beginPath();
    ctx.arc(iconCx, y, iconR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ACCENT_COLOR;
    ctx.beginPath();
    ctx.arc(iconCx, y, 5, 0, Math.PI * 2);
    ctx.fill();

    const textX = bodyX + iconR * 2 + 16;
    ctx.textAlign = "left";
    ctx.fillStyle = MUTED_TEXT;
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(label.toUpperCase(), textX, y - 6);
    ctx.fillStyle = DARK_TEXT;
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(value, textX, y + 20);
  }
  drawInfoRow(nameY + 84, "Campus", data.campusName);
  drawInfoRow(nameY + 156, "Gender", data.gender ?? "—");

  // QR zone: explicit white rounded-rect container sized to the QR itself
  // (plus inset padding) and vertically centered in the reserved zone —
  // guarantees a quiet zone for scan reliability without a tall, mostly-
  // empty white box below the code.
  const qrInset = 20;
  const qrSize = qrZoneWidth - qrInset * 2;
  const qrBoxSize = qrSize + qrInset * 2;
  const qrBoxX = qrZoneX;
  const qrBoxY = qrZoneY + (qrZoneHeight - qrBoxSize) / 2;

  roundRectPath(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 16);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#2563EB";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.drawImage(qrImage, qrBoxX + qrInset, qrBoxY + qrInset, qrSize, qrSize);

  ctx.restore(); // undo the card-outline clip

  return canvas.encode("png");
}
