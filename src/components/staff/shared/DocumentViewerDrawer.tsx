"use client";

import React, { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { DocumentZoomModal } from "@/components/ui/DocumentZoomModal";
import {
  ChevronLeftIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  DocumentIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface DocumentViewerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    id: string;
    requirementTitle?: string;
    fileName: string;
    url: string;
    fileType?: string;
    fileSize?: number;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    status?: string;
    verifiedBy?: string;
    verifiedAt?: string | Date;
  } | null;
  onApproveDocument?: (docId: string) => void;
  onRejectDocument?: (docId: string, reason?: string) => void;
  onRequestUpload?: (docId: string, message?: string) => void;
  isActionPending?: boolean;
}

export function DocumentViewerDrawer({
  isOpen,
  onClose,
  document,
  onApproveDocument,
  onRejectDocument,
  onRequestUpload,
  isActionPending,
}: DocumentViewerDrawerProps) {
  const [zoomScale, setZoomScale] = useState(1);
  const [isFullscreenZoom, setIsFullscreenZoom] = useState(false);

  if (!document) return null;

  const title = document.requirementTitle || document.fileName;
  const sizeMb = document.fileSize ? (document.fileSize / (1024 * 1024)).toFixed(1) : "1.2";
  const uploadDateStr = document.createdAt
    ? new Date(document.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Jul 19, 2026";

  const isImage = document.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(document.url || "");

  const handleDownload = () => {
    if (!document.url) return;
    const a = window.document.createElement("a");
    a.href = document.url;
    a.download = document.fileName;
    a.target = "_blank";
    a.click();
  };

  const getStatusBadge = () => {
    switch (document.status?.toUpperCase()) {
      case "APPROVED":
      case "VERIFIED":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <CheckCircleIcon className="h-4 w-4" /> VERIFIED
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
            <XCircleIcon className="h-4 w-4" /> REJECTED
          </span>
        );
      case "NEEDS_REVIEW":
      case "PENDING":
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            <ExclamationTriangleIcon className="h-4 w-4" /> NEEDS REVIEW
          </span>
        );
    }
  };

  return (
    <>
      <Drawer open={isOpen} onClose={onClose} title={title}>
        <div className="flex flex-col h-full divide-y divide-neutral-200/80">
          {/* TOP CANVAS AREA */}
          <div className="relative flex-1 bg-neutral-900 rounded-2xl overflow-hidden flex flex-col justify-between p-3 min-h-[360px]">
            {/* Header controls bar overlay */}
            <div className="flex items-center justify-between text-white z-10">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800/80 px-2.5 py-1.5 rounded-lg backdrop-blur"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Back
              </button>
              <span className="text-xs font-semibold bg-neutral-800/80 px-3 py-1 rounded-lg backdrop-blur text-neutral-200">
                1 / 1
              </span>
            </div>

            {/* Main Preview Container */}
            <div className="my-auto flex items-center justify-center overflow-auto max-h-[420px] p-2">
              {isImage ? (
                <img
                  src={document.url}
                  alt={document.fileName}
                  style={{ transform: `scale(${zoomScale})` }}
                  className="max-h-[380px] max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-200"
                />
              ) : (
                <iframe
                  src={document.url}
                  className="w-full h-[380px] rounded-lg bg-white shadow-2xl"
                  title={document.fileName}
                />
              )}
            </div>

            {/* Bottom Canvas Controls */}
            <div className="flex items-center justify-center gap-3 bg-neutral-800/80 backdrop-blur rounded-xl p-1.5 w-fit mx-auto text-white z-10">
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.max(0.6, s - 0.25))}
                className="p-1.5 hover:bg-neutral-700 rounded-lg transition"
                title="Zoom Out"
              >
                <MagnifyingGlassMinusIcon className="h-4 w-4" />
              </button>
              <span className="text-xs font-mono text-neutral-300 min-w-[42px] text-center">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.min(2.5, s + 0.25))}
                className="p-1.5 hover:bg-neutral-700 rounded-lg transition"
                title="Zoom In"
              >
                <MagnifyingGlassPlusIcon className="h-4 w-4" />
              </button>
              <div className="h-4 w-[1px] bg-neutral-700" />
              <button
                type="button"
                onClick={() => setIsFullscreenZoom(true)}
                className="p-1.5 hover:bg-neutral-700 rounded-lg transition"
                title="Fullscreen Preview"
              >
                <ArrowsPointingOutIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* DOCUMENT METADATA & ACTIONS */}
          <div className="pt-4 space-y-4">
            {/* Header info */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
                  <DocumentIcon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-neutral-900 text-sm">{title}</h4>
                  <p className="text-xs text-neutral-500 font-mono mt-0.5">
                    {document.fileName} • {uploadDateStr} • {sizeMb} MB
                  </p>
                </div>
              </div>
              <div>{getStatusBadge()}</div>
            </div>

            {/* Verification Metadata */}
            <div className="rounded-xl bg-neutral-50 border border-neutral-200/80 p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-neutral-600">
                <span>Verified by</span>
                <span className="font-semibold text-neutral-900">{document.verifiedBy || "Staff Reviewer"}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Verified date</span>
                <span className="font-medium text-neutral-800">
                  {document.verifiedAt
                    ? new Date(document.verifiedAt).toLocaleString()
                    : uploadDateStr}
                </span>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsFullscreenZoom(true)}
                className="w-full justify-center"
              >
                <MagnifyingGlassPlusIcon className="mr-1.5 h-4 w-4" />
                Fullscreen
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownload}
                className="w-full justify-center"
              >
                <ArrowDownTrayIcon className="mr-1.5 h-4 w-4" />
                Download
              </Button>
            </div>

            {/* Document Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                className="w-full bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 justify-center"
                size="sm"
                loading={isActionPending}
                onClick={() => {
                  const reason = window.prompt("Reason for rejecting this document?");
                  if (reason && onRejectDocument) onRejectDocument(document.id, reason);
                }}
              >
                <XCircleIcon className="mr-1.5 h-4 w-4 text-rose-600" />
                Reject Document
              </Button>

              <Button
                className="w-full bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 justify-center"
                size="sm"
                loading={isActionPending}
                onClick={() => {
                  const msg = window.prompt("Instructions for new document upload?");
                  if (msg && onRequestUpload) onRequestUpload(document.id, msg);
                }}
              >
                <ArrowPathIcon className="mr-1.5 h-4 w-4 text-amber-600" />
                Request New Upload
              </Button>
            </div>
          </div>
        </div>
      </Drawer>

      <DocumentZoomModal
        isOpen={isFullscreenZoom}
        onClose={() => setIsFullscreenZoom(false)}
        url={document.url}
        fileName={document.fileName}
        fileType={document.fileType}
      />
    </>
  );
}
