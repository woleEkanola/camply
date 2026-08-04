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
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-neutral-400">
          <span>
            Preset:{" "}
            <strong className="text-teal-700 dark:text-teal-400 font-bold">
              {preset} ({getAspectRatio() === 1 ? "1:1" : getAspectRatio() === 3 ? "3:1" : "4:1"})
            </strong>
          </span>
          <span>Drag image to adjust position</span>
        </div>

        {/* Canvas Workspace with Adaptive Checkerboard Grid */}
        <div
          className="relative overflow-hidden rounded-2xl border border-slate-300 dark:border-neutral-800 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:12px_12px] bg-slate-100 dark:bg-neutral-900 flex items-center justify-center p-6 cursor-grab active:cursor-grabbing select-none shadow-inner"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[350px] shadow-2xl rounded-xl border border-slate-300 dark:border-white/20 object-contain bg-white dark:bg-neutral-950"
          />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800">
          <div className="flex items-center space-x-3 flex-1">
            <MagnifyingGlassMinusIcon className="h-4 w-4 text-slate-500 dark:text-neutral-400" />
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-teal-600"
            />
            <MagnifyingGlassPlusIcon className="h-4 w-4 text-slate-500 dark:text-neutral-400" />
            <span className="text-xs font-mono font-bold w-12 text-slate-900 dark:text-white">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={handleRotate}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-slate-50 text-slate-800 dark:text-white transition flex items-center gap-1.5 text-xs font-bold shadow-xs"
            title="Rotate 90°"
          >
            <ArrowPathIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Rotate 90°
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-neutral-800">
          <Button variant="ghost" onClick={onClose} className="font-semibold">
            Cancel
          </Button>
          <Button onClick={handleSaveCrop} className="flex items-center gap-2 font-bold">
            <CheckIcon className="h-4 w-4" />
            Apply Crop
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
