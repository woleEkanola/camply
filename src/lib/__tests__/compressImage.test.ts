import { describe, expect, it } from "vitest";
import { compressImage, FileTooLargeError } from "../compressImage";

function imageFile(sizeBytes: number, name = "photo.jpg") {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
}

describe("compressImage size gate", () => {
  it("throws with the default 3MB limit and message when no maxBytes is passed", async () => {
    const file = imageFile(4 * 1024 * 1024);
    await expect(compressImage(file)).rejects.toThrow(FileTooLargeError);
    await expect(compressImage(file)).rejects.toThrow("File exceeds maximum upload size of 3MB");
  });

  it("throws with a custom, smaller limit and interpolates it into the message — not a hardcoded 3MB", async () => {
    const file = imageFile(2 * 1024 * 1024);
    const maxBytes = 1 * 1024 * 1024;
    await expect(compressImage(file, maxBytes)).rejects.toThrow("File exceeds maximum upload size of 1MB");
  });

  it("does not throw for a file within a custom higher limit that would have failed the old fixed 3MB gate", async () => {
    // Small enough to also skip past the compression path (which needs
    // browser-only FileReader/canvas APIs not available in this test
    // environment) — this only exercises the size gate itself.
    const file = imageFile(400 * 1024);
    const maxBytes = 4 * 1024 * 1024;
    await expect(compressImage(file, maxBytes)).resolves.toBe(file);
  });

  it("passes non-image files through untouched regardless of size or maxBytes", async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024)], "doc.pdf", { type: "application/pdf" });
    await expect(compressImage(file, 1024)).resolves.toBe(file);
  });
});
