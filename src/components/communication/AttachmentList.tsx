"use client";

import { useState, useCallback } from "react";
import { useUploadThing } from "@/utils/uploadthing-hook";
import { Button } from "@/components/ui/Button";

interface Attachment {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface AttachmentListProps {
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({ attachments, onChange }: AttachmentListProps) {
  const [isUploading, setIsUploading] = useState(false);

  const { startUpload } = useUploadThing("campaignAttachmentUploader", {
    onClientUploadComplete: (res) => {
      const newAttachments: Attachment[] = res.map((r) => ({
        url: r.ufsUrl ?? r.url,
        fileName: (r as any).fileName ?? r.name ?? "attachment",
        fileType: r.type ?? "application/octet-stream",
        fileSize: 0, // uploadthing doesn't expose fileSize in client callback
      }));
      onChange([...attachments, ...newAttachments]);
      setIsUploading(false);
    },
    onUploadError: (err) => {
      alert(err.message || "Upload failed");
      setIsUploading(false);
    },
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      await startUpload(files);
    } catch {
      setIsUploading(false);
    }
    e.target.value = "";
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
        id="campaign-attachment-input"
        onChange={handleFileSelect}
      />
      <label htmlFor="campaign-attachment-input">
        <Button type="button" variant="secondary" size="sm" disabled={isUploading} onClick={() => {}}>
          {isUploading ? "Uploading..." : "Add Attachment"}
        </Button>
      </label>

      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center justify-between rounded bg-neutral-50 px-3 py-1.5 text-xs">
              <span className="truncate text-neutral-700">{att.fileName}</span>
              <span className="mx-2 text-neutral-400">{formatSize(att.fileSize)}</span>
              <button onClick={() => removeAttachment(i)} className="text-red-500 hover:text-red-700">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
