export interface CampaignAttachment {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export const MAX_CAMPAIGN_ATTACHMENTS = 5;
export const MAX_CAMPAIGN_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png"]);
const UPLOAD_HOSTS = ["ufs.sh", "utfs.io", "uploadthing.com", "uploadthingusercontent.com"];

export function isAllowedCampaignFile(fileName: string): boolean {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(extension);
}

export function maxBytesForCampaignFile(fileName: string): number {
  return /\.(?:jpe?g|png)$/i.test(fileName) ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
}

export function isApprovedCampaignAttachmentUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return UPLOAD_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

export function validateCampaignAttachments(attachments: CampaignAttachment[] = []): string[] {
  const errors: string[] = [];
  if (attachments.length > MAX_CAMPAIGN_ATTACHMENTS) {
    errors.push(`A campaign can contain at most ${MAX_CAMPAIGN_ATTACHMENTS} shared attachments.`);
  }

  let total = 0;
  attachments.forEach((attachment, index) => {
    const label = attachment.fileName || `Attachment ${index + 1}`;
    if (!attachment.fileName || !isAllowedCampaignFile(attachment.fileName)) {
      errors.push(`${label} is not a supported PDF, Word, Excel, JPEG, or PNG file.`);
    }
    if (!Number.isFinite(attachment.fileSize) || attachment.fileSize <= 0) {
      errors.push(`${label} has an invalid file size.`);
    } else if (attachment.fileSize > maxBytesForCampaignFile(attachment.fileName)) {
      errors.push(`${label} exceeds its file-size limit.`);
    }
    if (!isApprovedCampaignAttachmentUrl(attachment.url)) {
      errors.push(`${label} is not hosted by the approved upload service.`);
    }
    total += Math.max(0, attachment.fileSize || 0);
  });

  if (total > MAX_CAMPAIGN_ATTACHMENT_BYTES) {
    errors.push("Shared attachments must total 25 MB or less so the personalized ID-card PDF remains within Resend's email limit.");
  }
  return errors;
}
