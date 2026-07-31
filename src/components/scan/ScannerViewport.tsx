"use client";

import { useEffect } from "react";
import { useScanDetector } from "@/hooks/useScanDetector";
import { ScanGuide } from "./ScanGuide";
import { ScannerControls } from "./ScannerControls";
import { Button } from "@/components/ui/Button";

interface ScannerViewportProps {
  /** Auto-starts on mount; never shows a "Launch Camera" button. */
  enabled: boolean;
  /** True while a result overlay is up — the stream stays alive, only
   * decoding is suppressed, so resuming is instant. */
  paused: boolean;
  onDecode: (token: string) => void;
  className?: string;
}

/** Fills its container with a live camera feed that never unmounts between
 * scans. This is the single biggest latency win over the previous button-
 * gated CameraScanner: camera re-init on low-end Android costs
 * 800-2000ms, and this component never pays that cost twice. */
export function ScannerViewport({ enabled, paused, onDecode, className }: ScannerViewportProps) {
  const detector = useScanDetector({ onDecode, paused, enabled });

  useEffect(() => {
    return () => {
      // stream cleanup handled inside useScanDetector's own effect
    };
  }, []);

  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className ?? ""}`}>
      <video
        ref={detector.videoRef}
        className="h-full w-full object-cover"
        playsInline
        muted
        autoPlay
        data-testid="scanner-video"
      />

      {detector.status === "running" && (
        <>
          <ScanGuide />
          <ScannerControls
            torchAvailable={detector.torchAvailable}
            torchOn={detector.torchOn}
            onToggleTorch={detector.toggleTorch}
            showCameraSwitch={detector.cameras.length > 1}
            onSwitchCamera={() => {
              const idx = detector.cameras.findIndex((c) => c.id === detector.selectedCameraId);
              const next = detector.cameras[(idx + 1) % detector.cameras.length];
              if (next) detector.selectCamera(next.id);
            }}
            statusLabel={paused ? "Processing…" : "Auto-detect ON"}
          />
        </>
      )}

      {detector.status === "starting" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white/70">
          Starting camera…
        </div>
      )}

      {detector.status === "error" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-neutral-950/95 p-6 text-center">
          <p className="text-sm font-semibold text-danger-400">Camera unavailable</p>
          <p className="text-xs text-neutral-400">{detector.error}</p>
          <Button size="sm" variant="secondary" onClick={detector.retry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
