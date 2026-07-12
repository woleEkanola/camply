"use client";
import { useRef, useState, useEffect } from "react";
import { useUploadThing } from "@/utils/uploadthing-hook";
import { compressImage } from "@/lib/compressImage";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

interface FileUploadProps {
  value?: string;
  onChange: (fileUrl: string) => void;
  disabled?: boolean;
  label?: string;
  accept?: string;
  endpoint?: keyof OurFileRouter;
}

export default function FileUpload({
  value,
  onChange,
  disabled,
  label,
  accept,
  endpoint = "documentUploader",
}: FileUploadProps) {
  const [preview, setPreview] = useState<string | null>(value || null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const { startUpload, isUploading } = useUploadThing(endpoint, {
    onClientUploadComplete: (res: Array<{ ufsUrl: string; url: string }>) => {
      const url = res[0]?.ufsUrl ?? res[0]?.url;
      if (url) {
        setPreview(url);
        onChange(url);
      }
    },
    onUploadError: (err) => {
      alert(err.message || "Upload failed");
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      await startUpload([compressed]);
    } catch (err: any) {
      alert(err.message || "Upload failed");
    }
  };

  const isPdf = preview?.toLowerCase().endsWith(".pdf");

  return (
    <div>
      {label && <label className="block font-medium mb-1 text-sm text-neutral-700">{label}</label>}
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? "image/*,application/pdf"}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="border px-3 py-1.5 rounded bg-white text-gray-700 hover:bg-gray-50 text-sm disabled:opacity-50 font-medium shadow-sm transition"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isUploading}
        >
          {isUploading ? "Uploading..." : (preview ? "Change File" : "Upload File")}
        </button>
        {preview && (
          <button
            type="button"
            className="text-xs text-red-600 hover:text-red-800 transition"
            onClick={() => {
              setPreview(null);
              onChange("");
            }}
            disabled={disabled || isUploading}
          >
            Remove
          </button>
        )}
      </div>
      {preview && (
        <div className="mt-2">
          {isPdf ? (
            <div className="flex items-center gap-2 p-2 bg-neutral-50 rounded border border-neutral-200 inline-flex">
              <span className="text-red-600 font-bold text-xs px-1.5 py-0.5 bg-red-50 rounded border border-red-200">PDF</span>
              <a
                href={preview}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-accent-700 underline hover:text-accent-800"
              >
                View Document
              </a>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Uploaded preview" className="max-h-32 rounded border shadow-sm object-contain" />
          )}
        </div>
      )}
    </div>
  );
}
