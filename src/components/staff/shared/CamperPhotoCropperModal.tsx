"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";

interface CamperPhotoCropperModalProps {
  open: boolean;
  onClose: () => void;
  camperId: string;
  camperName: string;
  photoUrl?: string | null;
  onPhotoUpdated?: () => void;
}

export function CamperPhotoCropperModal({
  open,
  onClose,
  camperId,
  camperName,
  photoUrl,
  onPhotoUpdated,
}: CamperPhotoCropperModalProps) {
  const utils = api.useUtils();
  const [mode, setMode] = useState<"view" | "crop">("view");
  const [imageSrc, setImageSrc] = useState<string | null>(photoUrl || null);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [saveError, setSaveError] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (open) {
      setImageSrc(photoUrl || null);
      setMode("view");
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setSaveError("");
      setSaveSuccess(false);
    }
  }, [open, photoUrl]);

  const updateCamperMutation = api.camper.update.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      void utils.registration.adminList.invalidate();
      void utils.registration.getById.invalidate();
      void utils.camper.getById.invalidate();
      void utils.camper.getByOrganization.invalidate();
      onPhotoUpdated?.();
      setTimeout(() => {
        setSaveSuccess(false);
        setMode("view");
      }, 1000);
    },
    onError: (err) => {
      setSaveError(err.message || "Failed to update photo.");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setSaveError("Please select a valid image file.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setMode("crop");
          setZoom(1);
          setRotation(0);
          setOffset({ x: 0, y: 0 });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== "crop") return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || mode !== "crop") return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (mode !== "crop" || e.touches.length !== 1) return;
    setIsDragging(true);
    setDragStart({ x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || mode !== "crop" || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleResetCrop = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const generateCroppedImage = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!imageSrc) {
        reject(new Error("No image source"));
        return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageSrc;
      img.onload = () => {
        const cropSize = 350; // Export size
        const canvas = document.createElement("canvas");
        canvas.width = cropSize;
        canvas.height = cropSize;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cropSize, cropSize);

        ctx.save();
        ctx.translate(cropSize / 2, cropSize / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(zoom, zoom);

        const viewportBox = 280;
        const baseScale = Math.max(viewportBox / img.width, viewportBox / img.height);
        const drawnW = img.width * baseScale;
        const drawnH = img.height * baseScale;

        const scaleFactor = cropSize / viewportBox;
        const drawX = -drawnW / 2 + offset.x * scaleFactor;
        const drawY = -drawnH / 2 + offset.y * scaleFactor;

        ctx.drawImage(img, drawX, drawY, drawnW, drawnH);
        ctx.restore();

        const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve(croppedDataUrl);
      };
      img.onerror = () => reject(new Error("Failed to load image for cropping"));
    });
  }, [imageSrc, zoom, rotation, offset]);

  const handleSaveCrop = async () => {
    try {
      setSaveError("");
      const croppedDataUrl = await generateCroppedImage();
      await updateCamperMutation.mutateAsync({
        id: camperId,
        profile: { photoUrl: croppedDataUrl },
      });
    } catch (err: any) {
      setSaveError(err?.message || "Failed to process cropped photo.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="">
      <div className="flex flex-col gap-4">
        {/* Header Bar inside modal */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div>
            <h3 className="text-base font-bold text-neutral-900">{camperName}</h3>
            <p className="text-xs text-neutral-500 font-medium">
              {mode === "view" ? "Camper Photo Preview" : "Crop & Reposition Photo"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              <span>Upload New</span>
            </Button>

            {mode === "view" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMode("crop")}
                className="flex items-center gap-1.5 text-xs"
              >
                <PencilIcon className="h-4 w-4" />
                <span>Crop Photo</span>
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMode("view")}
                className="flex items-center gap-1.5 text-xs"
              >
                <EyeIcon className="h-4 w-4" />
                <span>Full View</span>
              </Button>
            )}
          </div>
        </div>

        {saveError && (
          <div className="rounded-xl bg-danger-50 p-3 text-xs font-medium text-danger-700 border border-danger-200">
            {saveError}
          </div>
        )}

        {saveSuccess && (
          <div className="rounded-xl bg-success-50 p-3 text-xs font-medium text-success-700 border border-success-200 flex items-center gap-2">
            <CheckIcon className="h-4 w-4" />
            <span>Photo updated successfully!</span>
          </div>
        )}

        {/* MAIN IMAGE DISPLAY CONTAINER */}
        {mode === "view" ? (
          <div className="relative flex min-h-[350px] max-h-[60vh] w-full items-center justify-center rounded-2xl bg-neutral-900 p-4 border border-neutral-800 overflow-hidden shadow-inner">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={camperName}
                className="max-h-[55vh] max-w-full object-contain rounded-xl shadow-md transition-all duration-200"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-neutral-400">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-800 text-3xl font-bold text-neutral-300">
                  {camperName.charAt(0)}
                </div>
                <p className="text-sm font-medium">No photo available for this camper</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-xs"
                >
                  Upload Photo
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* CROPPER VIEWPORT */
          <div className="flex flex-col items-center gap-4">
            <div
              className="relative h-[300px] w-full max-w-[400px] rounded-2xl bg-neutral-900 border border-neutral-800 overflow-hidden shadow-inner cursor-move select-none touch-none flex items-center justify-center"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
            >
              {/* Image element being transformed */}
              {imageSrc && (
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="Crop preview"
                  draggable={false}
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                    transition: isDragging ? "none" : "transform 0.1s ease-out",
                    maxHeight: "280px",
                    maxWidth: "280px",
                    objectFit: "contain",
                  }}
                  className="select-none pointer-events-none"
                />
              )}

              {/* Circular Avatar Crop Boundary Mask */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-[240px] w-[240px] rounded-full border-2 border-dashed border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]" />
              </div>

              <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs">
                Drag to center face inside circle
              </div>
            </div>

            {/* CROPPER TOOLBAR CONTROLS */}
            <div className="flex w-full max-w-[400px] flex-col gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MagnifyingGlassMinusIcon className="h-4 w-4 shrink-0 text-neutral-500" />
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="h-2 flex-1 accent-accent-600 cursor-pointer"
                  />
                  <MagnifyingGlassPlusIcon className="h-4 w-4 shrink-0 text-neutral-500" />
                </div>
                <span className="w-10 text-right text-xs font-semibold text-neutral-700">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-neutral-200/80 pt-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRotate}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    <span>Rotate</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetCrop}
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 transition-colors"
                  >
                    Reset
                  </button>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  loading={updateCamperMutation.isPending}
                  onClick={handleSaveCrop}
                  className="text-xs font-bold"
                >
                  <CheckIcon className="mr-1 h-4 w-4" />
                  Save Cropped Photo
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
