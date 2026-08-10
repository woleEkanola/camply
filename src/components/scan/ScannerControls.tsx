"use client";

import { BoltIcon, BoltSlashIcon } from "@heroicons/react/24/solid";
import { ArrowPathRoundedSquareIcon } from "@heroicons/react/24/outline";

interface ScannerControlsProps {
  torchAvailable: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
  showCameraSwitch: boolean;
  onSwitchCamera: () => void;
  statusLabel: string;
}

/** Minimal overlay chrome on the camera: flash top-left, switch-camera
 * top-right, a single status pill at the bottom. Nothing else floats over
 * the live feed — no white cards, no scanner toggle. */
export function ScannerControls({
  torchAvailable,
  torchOn,
  onToggleTorch,
  showCameraSwitch,
  onSwitchCamera,
  statusLabel,
}: ScannerControlsProps) {
  return (
    <>
      {torchAvailable && (
        <button
          type="button"
          onClick={onToggleTorch}
          className={`absolute left-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 backdrop-blur transition-colors ${
            torchOn ? "theme-static-white bg-white text-black" : "bg-black/60 text-white hover:bg-black/70"
          }`}
          aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
          aria-pressed={torchOn}
        >
          {torchOn ? <BoltIcon className="h-5 w-5" /> : <BoltSlashIcon className="h-5 w-5" />}
        </button>
      )}

      {showCameraSwitch && (
        <button
          type="button"
          onClick={onSwitchCamera}
          className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur hover:bg-black/70"
          aria-label="Switch camera"
        >
          <ArrowPathRoundedSquareIcon className="h-5 w-5" />
        </button>
      )}

      <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
        <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {statusLabel}
        </span>
      </div>
    </>
  );
}
