"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  ArrowPathRoundedSquareIcon,
} from "@heroicons/react/24/outline";

export interface DocumentZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName: string;
  fileType?: string;
}

export function DocumentZoomModal({
  isOpen,
  onClose,
  url,
  fileName,
  fileType = "",
}: DocumentZoomModalProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartDistRef = useRef<number | null>(null);

  // Check if file is image or PDF
  const isImage =
    fileType.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(url || fileName);
  const isPdf =
    fileType === "application/pdf" ||
    /\.pdf$/i.test(url || fileName);

  // Reset transforms when modal opens or url changes
  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetView();
    }
  }, [isOpen, url, resetView]);

  // Zoom handlers
  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 5));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((s) => Math.min(s + 0.15, 5));
    } else {
      setScale((s) => Math.max(s - 0.15, 0.25));
    }
  };

  // Mouse Drag Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch Handlers for Mobile (Pinch zoom & Drag)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    } else if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchStartDistRef.current;
      setScale((s) => Math.min(Math.max(s * factor, 0.25), 5));
      touchStartDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartDistRef.current = null;
  };

  // Keyboard Shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleRotate();
      } else if (e.key === "0") {
        e.preventDefault();
        resetView();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, resetView]);

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-[100]">
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden flex flex-col">
          {/* Top Bar Header */}
          <div className="relative z-10 flex items-center justify-between bg-neutral-900/90 border-b border-neutral-800 px-4 py-3 text-white shadow-lg shrink-0">
            {/* Title & Metadata */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="truncate text-sm font-semibold text-neutral-100 max-w-xs sm:max-w-md">
                {fileName}
              </span>
              <span className="hidden sm:inline-block rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400 font-mono">
                {Math.round(scale * 100)}%
              </span>
            </div>

            {/* Toolbar Controls */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Zoom Out */}
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
                title="Zoom Out (-)"
              >
                <MagnifyingGlassMinusIcon className="h-5 w-5" />
              </button>

              {/* Scale percentage pill */}
              <span className="text-xs font-semibold text-neutral-300 px-1 font-mono min-w-[44px] text-center">
                {Math.round(scale * 100)}%
              </span>

              {/* Zoom In */}
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
                title="Zoom In (+)"
              >
                <MagnifyingGlassPlusIcon className="h-5 w-5" />
              </button>

              {/* Reset */}
              <button
                onClick={resetView}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
                title="Reset View (0)"
              >
                <ArrowPathRoundedSquareIcon className="h-5 w-5" />
              </button>

              <div className="h-4 w-[1px] bg-neutral-800 mx-1" />

              {/* Rotate */}
              {isImage && (
                <button
                  onClick={handleRotate}
                  className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
                  title="Rotate 90° (R)"
                >
                  <ArrowPathIcon className="h-5 w-5" />
                </button>
              )}

              {/* Toggle Fullscreen */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition hidden sm:inline-flex"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <ArrowsPointingInIcon className="h-5 w-5" />
                ) : (
                  <ArrowsPointingOutIcon className="h-5 w-5" />
                )}
              </button>

              <div className="h-4 w-[1px] bg-neutral-800 mx-1" />

              {/* Download */}
              <a
                href={url}
                download={fileName}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
                title="Download Document"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
              </a>

              {/* Open in New Tab */}
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
                title="Open original in new tab"
              >
                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
              </a>

              {/* Close Modal */}
              <button
                onClick={onClose}
                className="ml-2 p-1.5 rounded-lg bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 transition"
                title="Close (Esc)"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Viewport Container */}
          <div
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`flex-1 relative overflow-hidden flex items-center justify-center select-none ${
              isDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            {isImage ? (
              <div
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                  transition: isDragging ? "none" : "transform 0.1s ease-out",
                }}
                className="flex items-center justify-center max-w-full max-h-full"
              >
                <img
                  src={url}
                  alt={fileName}
                  draggable={false}
                  className="max-h-[85vh] max-w-[85vw] object-contain rounded shadow-2xl pointer-events-none"
                />
              </div>
            ) : isPdf ? (
              <div
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  transition: isDragging ? "none" : "transform 0.1s ease-out",
                  width: "90%",
                  height: "90%",
                }}
                className="flex items-center justify-center bg-white rounded-lg shadow-2xl overflow-hidden"
              >
                <iframe
                  src={`${url}#toolbar=1`}
                  className="w-full h-full border-0 rounded-lg"
                  title={fileName}
                />
              </div>
            ) : (
              /* Fallback for other file types */
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center max-w-md shadow-2xl text-neutral-300 space-y-4">
                <div className="text-4xl">📄</div>
                <div className="text-lg font-medium text-white">{fileName}</div>
                <p className="text-xs text-neutral-400">
                  This file type standard preview is not supported directly in the browser canvas.
                </p>
                <div className="flex justify-center gap-3">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium transition"
                  >
                    Open Document
                  </a>
                  <a
                    href={url}
                    download={fileName}
                    className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition"
                  >
                    Download
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
