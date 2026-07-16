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
  /** Fired whenever the upload-in-flight state changes, so a parent step can gate its own Next/Continue action. */
  onUploadingChange?: (uploading: boolean) => void;
  /** "avatar" renders a persistent square placeholder/preview box beside the button instead of the default free-standing image preview — used for the photo-of-teen field. */
  variant?: "default" | "avatar";
}

export default function FileUpload({
  value,
  onChange,
  disabled,
  label,
  accept,
  endpoint = "documentUploader",
  onUploadingChange,
  variant = "default",
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

  // Read the latest callback via a ref rather than depending on it directly —
  // an inline callback passed by the parent gets a new identity every render,
  // which would otherwise re-fire this effect (and the parent's resulting
  // state update) on every render, looping.
  const onUploadingChangeRef = useRef(onUploadingChange);
  onUploadingChangeRef.current = onUploadingChange;

  useEffect(() => {
    onUploadingChangeRef.current?.(isUploading);
  }, [isUploading]);

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

  const uploadControls = (
    <>
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
      {isUploading && (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-accent-600">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          Uploading...
        </p>
      )}
    </>
  );

  if (variant === "avatar") {
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
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Uploaded preview" className="h-full w-full object-cover" />
            ) : (
              <svg className="h-9 w-9 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            )}
          </div>
          <div>{uploadControls}</div>
        </div>
      </div>
    );
  }

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
      {uploadControls}
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
