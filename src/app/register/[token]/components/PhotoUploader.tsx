"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

  // Crop state
  const [cropMode, setCropMode] = useState(false);
  const [cropSrc, setCropSrc] = useState("");
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropScale, setCropScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

  async function uploadFile(file: File) {
    setError("");
    try {
      const compressed = await compressImage(file);
      await startUpload([compressed]);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    }
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    setCropX(0);
    setCropY(0);
    setCropScale(1);
    setCropMode(true);
  }

  function clearPhoto() {
    setPreview("");
    setError("");
    setCropMode(false);
    setCropSrc("");
    onChange("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  // ── Crop logic ──
  const CROP_SIZE = 200;

  const drawCropPreview = useCallback(() => {
    const canvas = cropCanvasRef.current;
    if (!canvas || !cropSrc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      const scaledW = img.width * cropScale;
      const scaledH = img.height * cropScale;
      const sx = cropX;
      const sy = cropY;
      ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, CROP_SIZE, CROP_SIZE);
      ctx.clip();
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);
      ctx.drawImage(img, -sx, -sy, scaledW, scaledH);
      ctx.restore();
    };
    img.src = cropSrc;
  }, [cropSrc, cropX, cropY, cropScale]);

  useEffect(() => {
    if (cropMode) drawCropPreview();
  }, [cropMode, drawCropPreview]);

  function applyCrop() {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], "cropped-photo.jpg", { type: "image/jpeg" });
          uploadFile(file);
        }
        setCropMode(false);
        setCropSrc("");
        URL.revokeObjectURL(cropSrc);
      },
      "image/jpeg",
      0.9
    );
  }

  function cancelCrop() {
    setCropMode(false);
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc("");
  }

  function handleCropMouseDown(e: React.MouseEvent) {
    setDragging(true);
    setDragStart({ x: e.clientX + cropX, y: e.clientY + cropY });
  }

  function handleCropMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setCropX(Math.max(0, dragStart.x - e.clientX));
    setCropY(Math.max(0, dragStart.y - e.clientY));
  }

  function handleCropMouseUp() {
    setDragging(false);
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="ml-0.5 text-danger-600">*</span>}
      </label>

      {/* Crop UI overlay */}
      {cropMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="rounded-2xl bg-white p-4 shadow-xl max-w-sm w-full">
            <p className="mb-3 text-sm font-semibold text-neutral-900">Crop Photo</p>
            <div
              className="relative mx-auto overflow-hidden rounded-lg border-2 border-accent-500"
              style={{ width: CROP_SIZE, height: CROP_SIZE }}
              onMouseDown={handleCropMouseDown}
              onMouseMove={handleCropMouseMove}
              onMouseUp={handleCropMouseUp}
              onMouseLeave={handleCropMouseUp}
            >
              <canvas ref={cropCanvasRef} className="block cursor-move" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-neutral-500">Zoom</span>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={cropScale}
                onChange={(e) => setCropScale(parseFloat(e.target.value))}
                className="flex-1 accent-accent-600"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={cancelCrop}
                className="flex-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCrop}
                className="flex-1 rounded-lg bg-accent-600 py-2 text-sm font-medium text-white hover:bg-accent-700"
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo slot */}
      <div className="mb-2 flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Uploaded photo" className="h-full w-full object-cover" />
        ) : (
          <svg className="h-8 w-8 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        )}
      </div>

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
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50 min-h-[36px]"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? "Uploading..." : "Choose File"}
        </button>
        <button
          type="button"
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50 min-h-[36px]"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isUploading}
        >
          Take Photo
        </button>
        {preview && (
          <>
            <button
              type="button"
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-50 min-h-[36px]"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.click();
              }}
              disabled={isUploading}
            >
              Crop
            </button>
            <button
              type="button"
              className="text-xs text-danger-600 transition hover:text-danger-800"
              onClick={clearPhoto}
              disabled={isUploading}
            >
              Remove
            </button>
          </>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}
