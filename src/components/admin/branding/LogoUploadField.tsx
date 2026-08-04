"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { LogoCropperModal, CropperPreset } from "./LogoCropperModal";
import {
  ArrowUpTrayIcon,
  TrashIcon,
  CheckCircleIcon,
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

    const kb = (file.size / 1024).toFixed(1);
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${kb} KB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;

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

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = (croppedDataUrl: string) => {
    onUpload(croppedDataUrl);
  };

  return (
    <div className="p-5 rounded-2xl bg-surface border border-border-default shadow-xs space-y-4 hover:border-border-strong transition">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp, image/svg+xml"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Title, Description & Usage Badges */}
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-base text-txt-primary">{title}</h4>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400">
              {preset} Preset
            </span>

            {isOptional && (
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isOverridden
                    ? "status-success"
                    : "bg-surface-raised text-txt-muted border-border-subtle"
                }`}
              >
                {isOverridden ? "Custom Override Active" : "Using Brand Logo"}
              </span>
            )}
          </div>

          <p className="text-xs text-txt-secondary leading-relaxed max-w-xl">{description}</p>

          {/* Usage Tags */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Used in:</span>
            {usageTags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-surface-raised border border-border-subtle text-txt-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          {isOptional && isOverridden ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-semibold"
              >
                <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                Replace
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={onRemoveOverride}
                className="flex items-center gap-1.5 text-xs font-semibold"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Remove Override
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-bold"
            >
              <ArrowUpTrayIcon className="h-3.5 w-3.5" />
              {isOptional ? "Override Logo" : "Upload Brand Logo"}
            </Button>
          )}
        </div>
      </div>

      {/* Universal Checkerboard Thumbnail Frame */}
      <div className="flex items-center space-x-4 p-3.5 rounded-xl bg-bg-surface border border-border-subtle">
        <div className="h-16 w-32 rounded-lg border border-border-default bg-[radial-gradient(var(--border-default)_1px,transparent_1px)] [background-size:8px_8px] bg-surface-raised flex items-center justify-center p-2 overflow-hidden shadow-inner">
          <img
            src={activeDisplayUrl}
            alt={title}
            className="max-h-full max-w-full object-contain drop-shadow-xs"
          />
        </div>

        <div className="text-xs space-y-1">
          <div className="flex items-center space-x-1.5 text-txt-primary font-bold">
            <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
            <span>{isOverridden ? "Custom Image Active" : "Active Image Display"}</span>
          </div>

          <div className="text-[11px] text-txt-muted flex flex-wrap items-center gap-3">
            {fileMeta ? (
              <>
                <span>Dimensions: <strong className="text-txt-primary">{fileMeta.dimensions}</strong></span>
                <span>Size: <strong className="text-txt-primary">{fileMeta.size}</strong></span>
              </>
            ) : (
              <span>Recommended: <strong className="text-txt-secondary">PNG or SVG with transparent background</strong></span>
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
