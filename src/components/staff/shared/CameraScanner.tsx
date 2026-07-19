"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/Button";
import { BoltIcon, BoltSlashIcon } from "@heroicons/react/24/solid";

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: string) => void;
  active: boolean;
}

export function CameraScanner({ onScanSuccess, onScanFailure, active }: CameraScannerProps) {
  const videoElementId = "camera-scanner-view";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Play audio beep using Web Audio API (no external file assets needed)
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 880 Hz
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioCtx.close();
      }, 120);
    } catch (err) {
      console.warn("Failed to play scanner beep:", err);
    }
  };

  // Enumerate cameras
  useEffect(() => {
    if (active) {
      Html5Qrcode.getCameras()
        .then((cameras) => {
          setDevices(cameras);
          if (cameras.length > 0) {
            // Prefer back camera for mobile scanning
            const backCamera = cameras.find((cam) =>
              cam.label.toLowerCase().includes("back") || cam.label.toLowerCase().includes("environment")
            );
            setSelectedDeviceId(backCamera ? backCamera.id : cameras[0].id);
          }
        })
        .catch((err) => {
          console.error("Error getting cameras:", err);
          setPermissionError("Camera permission denied or no cameras found.");
        });
    }
  }, [active]);

  // Start or Stop scan
  useEffect(() => {
    if (active && selectedDeviceId) {
      const html5Qrcode = new Html5Qrcode(videoElementId);
      scannerRef.current = html5Qrcode;

      html5Qrcode
        .start(
          selectedDeviceId,
          {
            fps: 15,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            },
          },
          (decodedText) => {
            playBeep();
            onScanSuccess(decodedText);
          },
          (errorMessage) => {
            if (onScanFailure) onScanFailure(errorMessage);
          }
        )
        .then(() => {
          setIsScanning(true);
          setPermissionError(null);
          // `torch` is a non-standard MediaTrackCapabilities field (supported on
          // most Android rear cameras, not iOS Safari) — TypeScript's DOM lib
          // doesn't know about it, hence the cast.
          try {
            const capabilities = html5Qrcode.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean };
            setTorchSupported(!!capabilities.torch);
          } catch {
            setTorchSupported(false);
          }
        })
        .catch((err) => {
          console.error("Failed to start scanner:", err);
          setPermissionError("Unable to start camera stream. Ensure camera is not in use.");
        });

      return () => {
        setTorchSupported(false);
        setTorchOn(false);
        if (html5Qrcode.isScanning) {
          html5Qrcode
            .stop()
            .then(() => {
              setIsScanning(false);
            })
            .catch((err) => console.error("Failed to stop scanner on cleanup:", err));
        }
      };
    }
  }, [active, selectedDeviceId]);

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    const next = !torchOn;
    try {
      await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch (err) {
      console.warn("Failed to toggle torch:", err);
    }
  };

  if (!active) return null;

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-neutral-900 rounded-xl overflow-hidden relative border border-neutral-800 shadow-2xl max-w-md mx-auto w-full aspect-video md:aspect-square">
      {/* Target scanning window overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
        <div className="w-48 h-48 md:w-60 md:h-60 border-2 border-accent-500 rounded-lg relative flex items-center justify-center bg-transparent">
          {/* Animated pulsing scan beam */}
          <div className="absolute left-0 right-0 h-0.5 bg-accent-400 opacity-75 shadow-lg animate-pulse" style={{ animationDuration: "1.5s" }} />
          {/* Corners decoration */}
          <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-accent-400 rounded-tl" />
          <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-accent-400 rounded-tr" />
          <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-accent-400 rounded-bl" />
          <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-accent-400 rounded-br" />
        </div>
      </div>

      <div id={videoElementId} className="w-full h-full object-cover bg-neutral-950 rounded-lg" />

      {torchSupported && (
        <button
          type="button"
          onClick={toggleTorch}
          className={`absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 backdrop-blur transition-colors ${
            torchOn ? "bg-accent-500 text-white" : "bg-black/60 text-white hover:bg-black/70"
          }`}
          aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
          aria-pressed={torchOn}
        >
          {torchOn ? <BoltIcon className="h-5 w-5" /> : <BoltSlashIcon className="h-5 w-5" />}
        </button>
      )}

      {permissionError && (
        <div className="absolute inset-0 bg-neutral-950/90 flex flex-col items-center justify-center p-6 text-center z-20">
          <p className="text-sm font-semibold text-danger-400 mb-2">Camera Error</p>
          <p className="text-xs text-neutral-400 mb-4">{permissionError}</p>
          {devices.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setSelectedDeviceId(devices[0].id)}>
              Retry First Camera
            </Button>
          )}
        </div>
      )}

      {/* Switch Camera selector (if multiple devices) */}
      {devices.length > 1 && (
        <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-center bg-black/60 backdrop-blur rounded-lg p-1.5 border border-white/10">
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="text-xs text-white bg-transparent border-none outline-none focus:ring-0 max-w-full font-medium"
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id} className="text-neutral-950 bg-white">
                {device.label || `Camera ${devices.indexOf(device) + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
