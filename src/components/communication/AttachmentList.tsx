"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useUploadThing } from "@/utils/uploadthing-hook";
import { Button } from "@/components/ui/Button";
import {
  MAX_CAMPAIGN_ATTACHMENTS,
  MAX_CAMPAIGN_ATTACHMENT_BYTES,
  isAllowedCampaignFile,
  maxBytesForCampaignFile,
} from "@/lib/email/campaignAttachments";

interface Attachment {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface AttachmentListProps {
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({ attachments, onChange, onUploadingChange }: AttachmentListProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFilesRef = useRef<File[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  useEffect(() => onUploadingChange?.(isUploading), [isUploading, onUploadingChange]);

  const { startUpload } = useUploadThing("campaignAttachmentUploader", {
    onClientUploadComplete: (res) => {
      const newAttachments: Attachment[] = res.map((r, index) => {
        const uploaded = r as typeof r & {
          size?: number;
          serverData?: { fileName?: string; fileType?: string; fileSize?: number };
        };
        return {
          url: r.ufsUrl ?? r.url,
          fileName: uploaded.serverData?.fileName ?? r.name ?? "attachment",
          fileType: uploaded.serverData?.fileType ?? r.type ?? selectedFilesRef.current[index]?.type ?? "application/octet-stream",
          fileSize: uploaded.serverData?.fileSize ?? uploaded.size ?? selectedFilesRef.current[index]?.size ?? 0,
        };
      });
      onChange([...attachmentsRef.current, ...newAttachments]);
      selectedFilesRef.current = [];
      setError(null);
      setIsUploading(false);
    },
    onUploadError: (err) => {
      setError(err.message || "Upload failed. Please try again.");
      selectedFilesRef.current = [];
      setIsUploading(false);
    },
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const nextCount = attachmentsRef.current.length + files.length;
    if (nextCount > MAX_CAMPAIGN_ATTACHMENTS) {
      setError(`You can attach at most ${MAX_CAMPAIGN_ATTACHMENTS} files.`);
      return;
    }
    for (const file of files) {
      if (!isAllowedCampaignFile(file.name)) {
        setError(`${file.name} is not a supported PDF, Word, Excel, JPEG, or PNG file.`);
        return;
      }
      if (file.size > maxBytesForCampaignFile(file.name)) {
        setError(`${file.name} exceeds its file-size limit.`);
        return;
      }
    }
    const totalBytes = attachmentsRef.current.reduce((sum, attachment) => sum + attachment.fileSize, 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_CAMPAIGN_ATTACHMENT_BYTES) {
      setError("Shared attachments must total 25 MB or less.");
      return;
    }
    selectedFilesRef.current = files;
    setError(null);
    setIsUploading(true);
    try {
      await startUpload(files);
    } catch {
      setIsUploading(false);
    }
  }, [startUpload]);

  const removeAttachment = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <input
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
        className="hidden"
        ref={inputRef}
        onChange={handleFileSelect}
      />
      <Button type="button" variant="secondary" size="sm" disabled={isUploading || attachments.length >= MAX_CAMPAIGN_ATTACHMENTS} onClick={() => inputRef.current?.click()}>
        {isUploading ? "Uploading..." : "Add Attachment"}
      </Button>
      <p className="text-xs text-txt-muted">Up to 5 files. Documents: 8 MB each. Images: 4 MB each. Combined: 25 MB.</p>
      {error && <p role="alert" className="text-xs text-danger-600">{error}</p>}

      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center justify-between rounded bg-neutral-50 px-3 py-1.5 text-xs">
              <span className="truncate text-neutral-700">{att.fileName}</span>
              <span className="mx-2 text-neutral-400">{formatSize(att.fileSize)}</span>
              <button type="button" aria-label={`Remove ${att.fileName}`} onClick={() => removeAttachment(i)} className="text-red-500 hover:text-red-700">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
