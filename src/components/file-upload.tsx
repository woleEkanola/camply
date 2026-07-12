"use client";
import { useRef, useState } from "react";
import { useUploadThing } from "@/utils/uploadthing-hook";
import { compressImage, FileTooLargeError } from "@/lib/compressImage";

interface FileUploadProps {
  value?: string;
  onChange: (fileUrl: string) => void;
  disabled?: boolean;
  label?: string;
}

export default function FileUpload({ value, onChange, disabled, label }: FileUploadProps) {
  const [preview, setPreview] = useState<string | null>(value || null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading } = useUploadThing("uploader", {
    onClientUploadComplete: (res) => {
      if (res?.[0]?.ufsUrl) {
        setPreview(res[0].ufsUrl);
        onChange(res[0].ufsUrl);
      }
    },
    onUploadError: (err) => {
      setError(err.message || "Upload failed");
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    try {
      const compressed = await compressImage(file);
      await startUpload([compressed]);
    } catch (err) {
      if (err instanceof FileTooLargeError) {
        setError("File exceeds maximum upload size of 3MB");
      } else {
        setError("Upload failed");
      }
    }
  };

  return (
    <div>
      {label && <label className="block font-medium mb-1">{label}</label>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />
      <button
        type="button"
        className="border px-2 py-1 rounded bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isUploading}
      >
        {isUploading ? "Uploading..." : (preview ? "Change File" : "Upload File")}
      </button>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      {preview && (
        <div className="mt-2">
          <img src={preview} alt="Uploaded" className="max-h-32 rounded border" />
        </div>
      )}
    </div>
  );
}
