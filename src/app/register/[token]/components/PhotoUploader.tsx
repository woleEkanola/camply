"use client";

import { useEffect, useRef, useState } from "react";
import { useUploadThing } from "@/utils/uploadthing-hook";
import { compressImage } from "@/lib/compressImage";

interface PhotoUploaderProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function PhotoUploader({ label, required, value, onChange }: PhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(value || "");
  const [error, setError] = useState("");

  useEffect(() => {
    setPreview(value || "");
  }, [value]);

  const { startUpload, isUploading } = useUploadThing("documentUploader", {
    onClientUploadComplete: (res: Array<{ ufsUrl?: string; url?: string }>) => {
      const url = res[0]?.ufsUrl ?? res[0]?.url ?? "";
      if (!url) return;
      setPreview(url);
      onChange(url);
      setError("");
    },
    onUploadError: (err) => {
      setError(err.message || "Upload failed");
    },
  });

  async function handleFile(file?: File) {
    if (!file) return;
    setError("");
    try {
      const compressed = await compressImage(file);
      await startUpload([compressed]);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    }
  }

  function clearPhoto() {
    setPreview("");
    setError("");
    onChange("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-danger-600">*</span>}
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={isUploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={isUploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? "Uploading..." : "Choose File"}
        </button>
        <button
          type="button"
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isUploading}
        >
          Take Photo
        </button>
        {preview && (
          <button
            type="button"
            className="text-xs text-danger-600 transition hover:text-danger-800"
            onClick={clearPhoto}
            disabled={isUploading}
          >
            Remove
          </button>
        )}
      </div>

      {required && !preview && <p className="mt-1 text-xs text-neutral-400">{label} is required.</p>}
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}

      {preview && (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Uploaded preview" className="max-h-32 rounded border object-contain shadow-sm" />
        </div>
      )}
    </div>
  );
}
