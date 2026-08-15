"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { offline, ReadinessChecklist } from "@/lib/offlineEngine";
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface OfflineReadinessModalProps {
  open: boolean;
  onClose: () => void;
  onOpenDownloadModal: () => void;
}

export function OfflineReadinessModal({ open, onClose, onOpenDownloadModal }: OfflineReadinessModalProps) {
  const [readiness, setReadiness] = useState<ReadinessChecklist | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshReadiness = async () => {
    setLoading(true);
    try {
      // Check camera permission
      let hasCam = false;
      if (typeof navigator !== "undefined" && navigator.permissions && navigator.permissions.query) {
        try {
          const status = await navigator.permissions.query({ name: "camera" as any });
          hasCam = status.state === "granted";
        } catch {
          hasCam = true; // Fallback assumes prompt will appear on usage
        }
      }
      const data = await offline.getReadiness(hasCam);
      setReadiness(data);
    } catch (err) {
      console.error("Failed to check readiness:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      refreshReadiness();
    }
  }, [open]);

  if (!readiness) return null;

  const items = [
    { label: "App Installed (PWA)", value: readiness.isAppInstalled, note: readiness.isAppInstalled ? "Running standalone" : "Running in browser" },
    { label: "Camera Permission", value: readiness.hasCameraPermission, note: readiness.hasCameraPermission ? "Granted" : "Will prompt on scan" },
    { label: "Database Downloaded", value: readiness.isDatabaseDownloaded, note: readiness.isDatabaseDownloaded ? "Ready for offline search" : "No campers cached" },
    { label: "Storage Available", value: readiness.isStorageAvailable, note: readiness.isStorageAvailable ? "Sufficient free storage" : "Low disk space" },
    { label: "Station Selected", value: readiness.isStationSelected, note: readiness.isStationSelected ? `Active: ${offline.getStation() || "Selected"}` : "None selected" },
    { label: "Last Sync Time", value: Boolean(readiness.lastSyncFormatted !== "Never"), note: readiness.lastSyncFormatted },
    { label: "Pending Queue", value: readiness.pendingQueueCount === 0, note: `${readiness.pendingQueueCount} items queued` },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="Offline Readiness Checklist">
      <div className="space-y-4">
        <div className={`p-4 rounded-xl border flex items-center justify-between ${readiness.isReadyForOffline ? "status-success border-current/20" : "status-attention border-current/20"}`}>
          <div>
            <h4 className="font-bold text-base">
              {readiness.isReadyForOffline ? "Ready for Offline Operation" : "Pre-Camp Action Required"}
            </h4>
            <p className="text-xs opacity-90">
              {readiness.isReadyForOffline
                ? "All requirements satisfied. Scanner and search work completely offline."
                : "Ensure camper database is downloaded and station is set before camp starts."}
            </p>
          </div>
          {readiness.isReadyForOffline ? (
            <CheckCircleIcon className="h-8 w-8 text-emerald-600 shrink-0 ml-2" />
          ) : (
            <XCircleIcon className="h-8 w-8 text-amber-600 shrink-0 ml-2" />
          )}
        </div>

        <div className="space-y-2 border border-border-default rounded-xl p-3 divide-y divide-border-default">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between pt-2 first:pt-0">
              <span className="text-sm font-medium text-txt-primary">{item.label}</span>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-txt-secondary">{item.note}</span>
                {item.value ? (
                  <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircleIcon className="h-5 w-5 text-amber-500" />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 flex flex-col gap-2">
          {!readiness.isDatabaseDownloaded && (
            <Button className="w-full" onClick={() => { onClose(); onOpenDownloadModal(); }}>
              Download Camper Database
            </Button>
          )}
          <Button variant="secondary" className="w-full" icon={<ArrowPathIcon className="h-4 w-4" />} loading={loading} onClick={refreshReadiness}>
            Re-check Status
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
