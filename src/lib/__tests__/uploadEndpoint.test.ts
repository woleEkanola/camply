import { describe, it, expect } from "vitest";
import { pickDocumentUploadEndpoint } from "../uploadEndpoint";

function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("pickDocumentUploadEndpoint", () => {
  it("routes images to documentUploader", () => {
    expect(pickDocumentUploadEndpoint(fakeFile("cert.jpg", "image/jpeg"))).toBe("documentUploader");
    expect(pickDocumentUploadEndpoint(fakeFile("cert.png", "image/png"))).toBe("documentUploader");
    expect(pickDocumentUploadEndpoint(fakeFile("cert.webp", "image/webp"))).toBe("documentUploader");
  });

  it("routes PDFs (by mime type) to consentFormUploader", () => {
    expect(pickDocumentUploadEndpoint(fakeFile("cert.pdf", "application/pdf"))).toBe("consentFormUploader");
  });

  it("routes PDFs (by .pdf name, even with a wrong/empty mime type) to consentFormUploader", () => {
    expect(pickDocumentUploadEndpoint(fakeFile("scan.PDF", ""))).toBe("consentFormUploader");
    expect(pickDocumentUploadEndpoint(fakeFile("scan.pdf", "application/octet-stream"))).toBe("consentFormUploader");
  });
});
