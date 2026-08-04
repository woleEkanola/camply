"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export type CropperPreset = "Wide" | "Banner" | "Square" | "Freeform";

interface LogoCropperModalProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  preset: CropperPreset;
  title?: string;
  onCropComplete: (croppedDataUrl: string) => void;
}

export function LogoCropperModal({
  open,
  onClose,
  imageSrc,
  preset,
  title = "Crop Logo",
  onCropComplete,
}: LogoCropperModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  // Determine target aspect ratio from preset
  const getAspectRatio = () => {
    switch (preset) {
      case "Wide":
        return 3 / 1;
      case "Banner":
        return 4 / 1;
      case "Square":
        return 1 / 1;
      case "Freeform":
      default:
        return 3 / 1;
    }
  };

  useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImgElement(img);
        setZoom(1);
        setRotation(0);
        setPan({ x: 0, y: 0 });
      };
      img.src = imageSrc;
    }
  }, [imageSrc]);

  useEffect(() => {
    if (!imgElement || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const aspectRatio = getAspectRatio();
    const targetWidth = 600;
    const targetHeight = Math.round(targetWidth / aspectRatio);

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.save();

    // Move to canvas center for rotation & pan
    ctx.translate(targetWidth / 2 + pan.x, targetHeight / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Draw centered image
    ctx.drawImage(
      imgElement,
      -imgElement.width / 2,
      -imgElement.height / 2,
      imgElement.width,
      imgElement.height
    );

    ctx.restore();
  }, [imgElement, zoom, rotation, pan, preset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleSaveCrop = () => {
    if (!canvasRef.current) return;
    const croppedDataUrl = canvasRef.current.toDataURL("image/png");
    onCropComplete(croppedDataUrl);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-txt-muted">
          <span>Preset: <strong className="text-teal-600 font-bold">{preset} ({getAspectRatio() === 1 ? "1:1" : getAspectRatio() === 3 ? "3:1" : "4:1"})</strong></span>
          <span>Drag image to adjust alignment</span>
        </div>

        {/* Canvas Workspace */}
        <div
          className="relative overflow-hidden rounded-xl border border-border-default bg-neutral-900 flex items-center justify-center p-4 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[350px] shadow-lg rounded-lg border border-white/20 object-contain bg-neutral-950/80"
          />
        </div>

        {/* Control Bar: Zoom & Rotate */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-surface-raised rounded-xl border border-border-default">
          <div className="flex items-center space-x-3 flex-1">
            <MagnifyingGlassMinusIcon className="h-4 w-4 text-txt-muted" />
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-600"
            />
            <MagnifyingGlassPlusIcon className="h-4 w-4 text-txt-muted" />
            <span className="text-xs font-mono font-semibold w-12 text-txt-primary">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={handleRotate}
            className="p-2 rounded-lg border border-border-default hover:bg-bg-subtle text-txt-secondary hover:text-txt-primary transition flex items-center gap-1.5 text-xs font-medium"
            title="Rotate 90°"
          >
            <ArrowPathIcon className="h-4 w-4 text-teal-600" />
            Rotate
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end space-x-2 pt-2 border-t border-border-default">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSaveCrop} className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4" />
            Apply Crop
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
