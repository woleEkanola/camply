"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { LogoCropperModal, CropperPreset } from "./LogoCropperModal";
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  CheckCircleIcon,
  SparklesIcon,
  ScissorsIcon,
} from "@heroicons/react/24/outline";

interface LogoUploadFieldProps {
  title: string;
  description: string;
  usageTags: string[];
  preset: CropperPreset;
  currentUrl?: string | null;
  inheritedUrl?: string | null;
  isOptional?: boolean;
  onUpload: (croppedDataUrl: string) => void;
  onRemoveOverride?: () => void;
}

export function LogoUploadField({
  title,
  description,
  usageTags,
  preset,
  currentUrl,
  inheritedUrl,
  isOptional = false,
  onUpload,
  onRemoveOverride,
}: LogoUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRawImage, setSelectedRawImage] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [fileMeta, setFileMeta] = useState<{ size: string; dimensions: string } | null>(null);

  const activeDisplayUrl = currentUrl || inheritedUrl || "/logo.png";
  const isOverridden = !!currentUrl;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Calculate readable file size
    const kb = (file.size / 1024).toFixed(1);
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${kb} KB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;

      // Extract image dimensions
      const img = new Image();
      img.onload = () => {
        setFileMeta({
          size: sizeStr,
          dimensions: `${img.width} × ${img.height} px`,
        });
      };
      img.src = src;

      setSelectedRawImage(src);
      setCropperOpen(true);
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be chosen again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = (croppedDataUrl: string) => {
    onUpload(croppedDataUrl);
  };

  return (
    <div className="p-5 rounded-2xl bg-surface border border-border-default shadow-xs space-y-4 hover:border-neutral-300 dark:hover:border-neutral-700 transition">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp, image/svg+xml"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Info & Descriptions */}
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center space-x-2.5">
            <h4 className="font-bold text-base text-txt-primary">{title}</h4>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-teal-500/20 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400">
              {preset} Preset
            </span>

            {isOptional && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isOverridden
                    ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                    : "bg-neutral-100 dark:bg-neutral-800 text-txt-muted"
                }`}
              >
                {isOverridden ? "Custom Override Active" : "Using Brand Logo"}
              </span>
            )}
          </div>

          <p className="text-xs text-txt-secondary leading-relaxed max-w-xl">{description}</p>

          {/* Usage Badges */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Used in:</span>
            {usageTags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface-raised border border-border-default text-txt-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          {isOptional && isOverridden ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs"
              >
                <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                Replace
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={onRemoveOverride}
                className="flex items-center gap-1.5 text-xs"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Remove Override
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs"
            >
              <ArrowUpTrayIcon className="h-3.5 w-3.5" />
              {isOptional ? "Override Logo" : "Upload Brand Logo"}
            </Button>
          )}
        </div>
      </div>

      {/* Preview Box & Image Specs Readout */}
      <div className="flex items-center space-x-4 p-3.5 rounded-xl bg-bg-surface border border-border-subtle">
        <div className="h-14 w-28 rounded-lg border border-border-default bg-neutral-900 flex items-center justify-center p-1.5 overflow-hidden">
          <img
            src={activeDisplayUrl}
            alt={title}
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <div className="text-xs space-y-1">
          <div className="flex items-center space-x-1.5 text-txt-primary font-medium">
            <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
            <span>{isOverridden ? "Custom Image Uploaded" : "Active Image Display"}</span>
          </div>

          <div className="text-[11px] text-txt-muted flex items-center space-x-3">
            {fileMeta ? (
              <>
                <span>Dimensions: <strong>{fileMeta.dimensions}</strong></span>
                <span>Size: <strong>{fileMeta.size}</strong></span>
              </>
            ) : (
              <span>Recommended: <strong>PNG/SVG transparent background</strong></span>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Cropper Modal */}
      {selectedRawImage && (
        <LogoCropperModal
          open={cropperOpen}
          onClose={() => setCropperOpen(false)}
          imageSrc={selectedRawImage}
          preset={preset}
          title={`Crop ${title}`}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
}
