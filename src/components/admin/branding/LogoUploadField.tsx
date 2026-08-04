"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { LogoCropperModal, CropperPreset } from "./LogoCropperModal";
import {
  ArrowUpTrayIcon,
  TrashIcon,
  CheckCircleIcon,
  SunIcon,
  MoonIcon,
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
  const [previewBg, setPreviewBg] = useState<"light" | "dark" | "checker">("light");

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
    <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm space-y-5 hover:border-slate-300 dark:hover:border-neutral-700 transition-all">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp, image/svg+xml"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Info & Descriptions */}
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">{title}</h4>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-teal-500/20 bg-teal-500/10 text-teal-800 dark:text-teal-300">
              {preset} Preset
            </span>

            {isOptional && (
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isOverridden
                    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30"
                    : "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-slate-300 border-slate-200 dark:border-neutral-700"
                }`}
              >
                {isOverridden ? "Custom Override Active" : "Using Brand Logo"}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600 dark:text-neutral-400 leading-relaxed max-w-xl">{description}</p>

          {/* Usage Badges */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold text-slate-600 dark:text-neutral-400 uppercase tracking-wider">Used in:</span>
            {usageTags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-semibold px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-300"
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

      {/* Preview Box & Image Specs Readout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-neutral-950/60 border border-slate-200 dark:border-neutral-800">
        <div className="flex items-center space-x-4">
          {/* Logo Thumbnail Container with Light/Dark Background Toggle */}
          <div className="relative group">
            <div
              className={`h-16 w-32 rounded-lg border border-slate-300 dark:border-neutral-700 flex items-center justify-center p-2 overflow-hidden transition-colors ${
                previewBg === "light"
                  ? "bg-white"
                  : previewBg === "dark"
                  ? "bg-neutral-900"
                  : "bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:8px_8px] bg-slate-100 dark:bg-neutral-900"
              }`}
            >
              <img
                src={activeDisplayUrl}
                alt={title}
                className="max-h-full max-w-full object-contain drop-shadow-xs"
              />
            </div>

            {/* Micro Toggle for Thumbnail Preview Background */}
            <div className="absolute -bottom-2 -right-2 flex bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-full p-0.5 shadow-xs text-[10px]">
              <button
                type="button"
                onClick={() => setPreviewBg("light")}
                title="Light mode preview"
                className={`p-1 rounded-full ${previewBg === "light" ? "bg-slate-200 dark:bg-neutral-700 text-amber-600" : "text-slate-600"}`}
              >
                <SunIcon className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewBg("dark")}
                title="Dark mode preview"
                className={`p-1 rounded-full ${previewBg === "dark" ? "bg-slate-200 dark:bg-neutral-700 text-indigo-400" : "text-slate-600"}`}
              >
                <MoonIcon className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="text-xs space-y-1">
            <div className="flex items-center space-x-1.5 text-slate-900 dark:text-white font-bold">
              <CheckCircleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isOverridden ? "Custom Image Active" : "Active Image Display"}</span>
            </div>

            <div className="text-[11px] text-slate-600 dark:text-neutral-400 flex flex-wrap items-center gap-2">
              {fileMeta ? (
                <>
                  <span>Dimensions: <strong className="text-slate-900 dark:text-slate-200">{fileMeta.dimensions}</strong></span>
                  <span>Size: <strong className="text-slate-900 dark:text-slate-200">{fileMeta.size}</strong></span>
                </>
              ) : (
                <span>Recommended: <strong className="text-slate-800 dark:text-slate-300">PNG or SVG with transparent background</strong></span>
              )}
            </div>
          </div>
        </div>

        <span className="text-[10px] font-semibold text-slate-500 dark:text-neutral-500 self-end sm:self-center">
          Click buttons above to switch preview theme
        </span>
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
