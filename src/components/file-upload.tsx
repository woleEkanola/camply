"use client";
import { useRef, useState } from "react";

interface FileUploadProps {
  value?: string;
  onChange: (fileUrl: string) => void;
  disabled?: boolean;
  label?: string;
}

export default function FileUpload({ value, onChange, disabled, label }: FileUploadProps) {
  const [preview, setPreview] = useState<string | null>(value || null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    // TODO: Replace with actual upload logic (API endpoint or tRPC mutation)
    const formData = new FormData();
    formData.append("file", file);
    // Example: POST to /api/upload (you will need to implement this route)
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      // Handle error
      setUploading(false);
      alert("Upload failed");
      return;
    }
    const data = await res.json();
    setPreview(data.url);
    onChange(data.url);
    setUploading(false);
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
        disabled={disabled || uploading}
      />
      <button
        type="button"
        className="border px-2 py-1 rounded bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
      >
        {uploading ? "Uploading..." : (preview ? "Change File" : "Upload File")}
      </button>
      {preview && (
        <div className="mt-2">
          <img src={preview} alt="Uploaded" className="max-h-32 rounded border" />
        </div>
      )}
    </div>
  );
}
