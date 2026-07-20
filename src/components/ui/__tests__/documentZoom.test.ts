import { describe, it, expect } from "vitest";

// Helper functions matching DocumentZoomModal logic
export function isImageType(fileType: string, urlOrName: string): boolean {
  return (
    fileType.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(urlOrName)
  );
}

export function isPdfType(fileType: string, urlOrName: string): boolean {
  return (
    fileType === "application/pdf" ||
    /\.pdf$/i.test(urlOrName)
  );
}

export function calculateNewScale(currentScale: number, delta: number, min = 0.25, max = 5.0): number {
  const next = currentScale + delta;
  return Math.min(Math.max(next, min), max);
}

export function calculateNextRotation(currentRotation: number): number {
  return (currentRotation + 90) % 360;
}

describe("DocumentZoomModal Utilities", () => {
  it("correctly identifies image file types", () => {
    expect(isImageType("image/png", "receipt.png")).toBe(true);
    expect(isImageType("image/jpeg", "photo.jpg")).toBe(true);
    expect(isImageType("", "https://storage.com/docs/passport.WEBP")).toBe(true);
    expect(isImageType("", "document.pdf")).toBe(false);
  });

  it("correctly identifies PDF file types", () => {
    expect(isPdfType("application/pdf", "consent.pdf")).toBe(true);
    expect(isPdfType("", "https://storage.com/forms/medical.PDF")).toBe(true);
    expect(isPdfType("image/png", "image.png")).toBe(false);
  });

  it("calculates zoom scale bounded between min (0.25) and max (5.0)", () => {
    expect(calculateNewScale(1.0, 0.25)).toBe(1.25);
    expect(calculateNewScale(1.0, -0.25)).toBe(0.75);
    expect(calculateNewScale(4.9, 0.5)).toBe(5.0); // max cap
    expect(calculateNewScale(0.3, -0.2)).toBe(0.25); // min cap
  });

  it("rotates images in 90 degree increments clockwise", () => {
    expect(calculateNextRotation(0)).toBe(90);
    expect(calculateNextRotation(90)).toBe(180);
    expect(calculateNextRotation(180)).toBe(270);
    expect(calculateNextRotation(270)).toBe(0);
  });
});
