"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Html5Qrcode } from "html5-qrcode";

export type DetectorEngine = "barcode-detector" | "qr-scanner" | "html5-qrcode" | null;
export type DetectorStatus = "idle" | "starting" | "running" | "error";

interface CameraOption {
  id: string;
  label: string;
}

interface UseScanDetectorOptions {
  /** Called once per newly-decoded token. The caller owns duplicate-token
   * suppression and pause/resume — this hook only reports what it sees. */
  onDecode: (token: string) => void;
  /** While true, decoded tokens are ignored but the stream keeps running —
   * the camera never stops/restarts between scans (the biggest latency win
   * on low-end Android; re-init costs 800-2000ms). */
  paused: boolean;
  enabled: boolean;
}

interface UseScanDetectorResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: DetectorStatus;
  engine: DetectorEngine;
  error: string | null;
  torchAvailable: boolean;
  torchOn: boolean;
  toggleTorch: () => Promise<void>;
  cameras: CameraOption[];
  selectedCameraId: string;
  selectCamera: (id: string) => void;
  retry: () => void;
}

const DECODE_THROTTLE_MS = 90; // ~11fps cap on BarcodeDetector's rVFC loop

// lastDecodeAtRef MUST be stamped with performance.now() (monotonic, ms
// since navigation start), never Date.now() (epoch ms) — tick() below
// diffs it against performance.now(). Mixing the two clocks makes the
// diff permanently negative after the first decode, which silently and
// permanently disables further detection with no visible symptom (the rAF
// loop keeps running, status stays "running") until the page is reloaded.

/**
 * Layered QR detection: native BarcodeDetector when available (fastest, no
 * library, runs on requestVideoFrameCallback against a stream we own) ->
 * qr-scanner (worker-based, ~12KB, covers iOS Safari/older Chrome, attaches
 * to the same <video>/stream so switching never re-prompts for camera
 * permission) -> html5-qrcode as a last-resort compatibility path.
 *
 * The hook owns the MediaStream and <video> element for the first two
 * paths so torch/camera-enumeration work uniformly; html5-qrcode manages
 * its own internally since it doesn't expose stream ownership.
 */
export function useScanDetector({ onDecode, paused, enabled }: UseScanDetectorOptions): UseScanDetectorResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const lastDecodeAtRef = useRef(0);
  const pausedRef = useRef(paused);
  const onDecodeRef = useRef(onDecode);
  const barcodeDetectorRef = useRef<any>(null);

  const [status, setStatus] = useState<DetectorStatus>("idle");
  const [engine, setEngine] = useState<DetectorEngine>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const reportDecode = useCallback((token: string) => {
    if (pausedRef.current || !token) return;
    lastDecodeAtRef.current = performance.now();
    onDecodeRef.current(token);
  }, []);

  const stopAll = useCallback(() => {
    if (rafHandleRef.current !== null) {
      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = null;
    }
    if (qrScannerRef.current) {
      qrScannerRef.current.stop();
      qrScannerRef.current.destroy();
      qrScannerRef.current = null;
    }
    if (html5QrRef.current) {
      const inst = html5QrRef.current;
      html5QrRef.current = null;
      if (inst.isScanning) inst.stop().catch(() => {});
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setTorchAvailable(false);
    setTorchOn(false);
  }, []);

  const detectTorchSupport = useCallback((stream: MediaStream) => {
    try {
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchAvailable(!!capabilities?.torch);
    } catch {
      setTorchAvailable(false);
    }
  }, []);

  const runBarcodeDetectorLoop = useCallback(
    (video: HTMLVideoElement, detector: any) => {
      const tick = async () => {
        if (!video.isConnected) return;
        const now = performance.now();
        if (now - lastDecodeAtRef.current > DECODE_THROTTLE_MS && video.readyState >= 2) {
          try {
            const results = await detector.detect(video);
            if (results?.length) {
              reportDecode(results[0].rawValue);
            }
          } catch {
            // transient decode errors are expected on out-of-focus frames
          }
        }
        rafHandleRef.current = requestAnimationFrame(tick);
      };
      rafHandleRef.current = requestAnimationFrame(tick);
    },
    [reportDecode]
  );

  const startWithStream = useCallback(
    async (deviceId?: string) => {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      detectTorchSupport(stream);

      const video = videoRef.current;
      if (!video) throw new Error("Video element not mounted");
      video.srcObject = stream;
      await video.play();

      const BarcodeDetectorCtor = (window as any).BarcodeDetector;
      if (BarcodeDetectorCtor) {
        try {
          const formats = await BarcodeDetectorCtor.getSupportedFormats();
          if (formats.includes("qr_code")) {
            const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
            barcodeDetectorRef.current = detector;
            setEngine("barcode-detector");
            runBarcodeDetectorLoop(video, detector);
            return;
          }
        } catch {
          // fall through to qr-scanner
        }
      }

      // qr-scanner fallback, attached to the stream/video we already own —
      // no second permission prompt.
      const scanner = new QrScanner(
        video,
        (result) => reportDecode(typeof result === "string" ? result : result.data),
        { maxScansPerSecond: 10, returnDetailedScanResult: true }
      );
      qrScannerRef.current = scanner;
      setEngine("qr-scanner");
      await scanner.start();
    },
    [detectTorchSupport, runBarcodeDetectorLoop, reportDecode]
  );

  const startWithHtml5Qrcode = useCallback(
    async (deviceId: string) => {
      const elementId = "scan-experience-html5qr-fallback";
      let el = document.getElementById(elementId);
      if (!el) {
        el = document.createElement("div");
        el.id = elementId;
        el.style.display = "none";
        document.body.appendChild(el);
      }
      const instance = new Html5Qrcode(elementId);
      html5QrRef.current = instance;
      setEngine("html5-qrcode");
      await instance.start(
        deviceId,
        {
          fps: 15,
          qrbox: (w, h) => {
            const size = Math.max(50, Math.floor(Math.min(w, h) * 0.7));
            return { width: size, height: size };
          },
        },
        (decodedText) => reportDecode(decodedText),
        () => {}
      );
    },
    [reportDecode]
  );

  const start = useCallback(async () => {
    setStatus("starting");
    setError(null);
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = list.filter((d) => d.kind === "videoinput");
      const backCamera = videoInputs.find((d) => /back|environment/i.test(d.label));
      const chosenId = selectedCameraId || backCamera?.deviceId || videoInputs[0]?.deviceId || "";
      setCameras(videoInputs.map((d) => ({ id: d.deviceId, label: d.label || "Camera" })));
      if (chosenId) setSelectedCameraId(chosenId);

      try {
        await startWithStream(chosenId || undefined);
      } catch (streamErr) {
        // Last-resort compatibility path for browsers where getUserMedia +
        // BarcodeDetector/qr-scanner both fail against a real device id.
        if (chosenId) {
          await startWithHtml5Qrcode(chosenId);
        } else {
          throw streamErr;
        }
      }
      setStatus("running");
    } catch (err: any) {
      setStatus("error");
      setError(err?.message || "Unable to start camera. Check camera permissions.");
    }
  }, [selectedCameraId, startWithStream, startWithHtml5Qrcode]);

  useEffect(() => {
    if (!enabled) {
      stopAll();
      setStatus("idle");
      setEngine(null);
      return;
    }
    start();
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selectedCameraId, retryTick]);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // torch toggle can silently fail on some Android chipsets under load
    }
  }, [torchOn]);

  const selectCamera = useCallback((id: string) => {
    setSelectedCameraId(id);
  }, []);

  const retry = useCallback(() => setRetryTick((t) => t + 1), []);

  return {
    videoRef,
    status,
    engine,
    error,
    torchAvailable,
    torchOn,
    toggleTorch,
    cameras,
    selectedCameraId,
    selectCamera,
    retry,
  };
}
