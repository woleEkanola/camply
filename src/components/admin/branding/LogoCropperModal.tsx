"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon,
  CheckIcon,
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

    ctx.translate(targetWidth / 2 + pan.x, targetHeight / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

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
        <div className="flex items-center justify-between text-xs text-txt-secondary">
          <span>
            Preset:{" "}
            <strong className="text-teal-600 dark:text-teal-400 font-bold">
              {preset} ({getAspectRatio() === 1 ? "1:1" : getAspectRatio() === 3 ? "3:1" : "4:1"})
            </strong>
          </span>
          <span>Drag image to adjust position</span>
        </div>

        {/* Canvas Workspace with Adaptive Checkerboard Grid */}
        <div
          className="relative overflow-hidden rounded-xl border border-border-default bg-[radial-gradient(var(--border-default)_1px,transparent_1px)] [background-size:10px_10px] bg-surface-raised flex items-center justify-center p-4 cursor-grab active:cursor-grabbing select-none shadow-inner"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[320px] shadow-lg rounded-lg border border-border-default object-contain bg-surface"
          />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-bg-subtle rounded-xl border border-border-subtle">
          <div className="flex items-center space-x-2 flex-1">
            <MagnifyingGlassMinusIcon className="h-4 w-4 text-txt-muted" />
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-teal-600"
            />
            <MagnifyingGlassPlusIcon className="h-4 w-4 text-txt-muted" />
            <span className="text-xs font-mono font-bold w-10 text-txt-primary">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRotate}
            className="flex items-center gap-1 text-xs"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Rotate 90°
          </Button>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-2 pt-2 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSaveCrop} className="flex items-center gap-1.5 font-bold">
            <CheckIcon className="h-4 w-4" />
            Apply Crop
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
