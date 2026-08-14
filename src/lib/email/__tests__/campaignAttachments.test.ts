import { describe, expect, it } from "vitest";
import {
  MAX_CAMPAIGN_ATTACHMENT_BYTES,
  validateCampaignAttachments,
} from "../campaignAttachments";

const attachment = (overrides: Partial<{ url: string; fileName: string; fileType: string; fileSize: number }> = {}) => ({
  url: "https://example.ufs.sh/f/camp-guide.pdf",
  fileName: "camp-guide.pdf",
  fileType: "application/pdf",
  fileSize: 1024,
  ...overrides,
});

describe("validateCampaignAttachments", () => {
  it("accepts the supported UploadThing-hosted file contract", () => {
    expect(validateCampaignAttachments([
      attachment(),
      attachment({ fileName: "photo.jpg", fileType: "image/jpeg" }),
    ])).toEqual([]);
  });

  it("rejects unapproved hosts and executable file types", () => {
    const errors = validateCampaignAttachments([
      attachment({ url: "https://attacker.example/file.pdf" }),
      attachment({ fileName: "payload.exe" }),
    ]);
    expect(errors.some((error) => error.includes("approved upload service"))).toBe(true);
    expect(errors.some((error) => error.includes("not a supported"))).toBe(true);
  });

  it("enforces the five-file and conservative combined-size limits", () => {
    const tooMany = Array.from({ length: 6 }, (_, index) => attachment({ fileName: `file-${index}.pdf` }));
    expect(validateCampaignAttachments(tooMany).some((error) => error.includes("at most 5"))).toBe(true);

    const oversizedTotal = Array.from({ length: 4 }, (_, index) => attachment({ fileName: `file-${index}.pdf`, fileSize: MAX_CAMPAIGN_ATTACHMENT_BYTES / 4 + 1 }));
    expect(validateCampaignAttachments(oversizedTotal).some((error) => error.includes("25 MB"))).toBe(true);
  });
});
