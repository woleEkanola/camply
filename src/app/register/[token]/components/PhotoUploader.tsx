"use client";

import FileUpload from "@/components/file-upload";

interface PhotoUploaderProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function PhotoUploader({ label, required, value, onChange }: PhotoUploaderProps) {
  return (
    <div>
      <FileUpload
        label={label}
        value={value}
        onChange={onChange}
        accept="image/*"
        endpoint="documentUploader"
      />
      {required && <p className="mt-1 text-xs text-neutral-400">{label} is required.</p>}
    </div>
  );
}
