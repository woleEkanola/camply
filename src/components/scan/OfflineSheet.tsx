"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ArrowPathIcon, CpuChipIcon, CheckBadgeIcon, CircleStackIcon } from "@heroicons/react/24/outline";
import { offline, OfflineStatus } from "@/lib/offlineEngine";

interface OfflineSheetProps {
  open: boolean;
  onClose: () => void;
  isOnline: boolean;
  offlineQueueCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
  isRefreshingCache: boolean;
  onRefreshCache: () => void;
  lastCacheSyncTime: string;
  onOpenReadiness?: () => void;
  onOpenDownloadModal?: () => void;
}

export function OfflineSheet({
  open,
  onClose,
  isOnline,
  offlineQueueCount,
  isSyncing,
  onSyncNow,
  isRefreshingCache,
  onRefreshCache,
  lastCacheSyncTime,
  onOpenReadiness,
  onOpenDownloadModal,
}: OfflineSheetProps) {
  const [engineStatus, setEngineStatus] = useState<OfflineStatus | null>(null);

  useEffect(() => {
    if (open) {
      offline.getStatus().then(setEngineStatus);
    }
  }, [open, isOnline, offlineQueueCount]);

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 MB";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Sync & Offline Status">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-border-default p-3 bg-bg-surface">
          <span className="text-sm font-semibold text-txt-primary">Connection</span>
          <span className={`text-sm font-bold ${isOnline ? "text-emerald-600" : "text-amber-600"}`}>
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border-default p-3 bg-bg-surface">
          <span className="text-sm font-semibold text-txt-primary">Scans waiting to sync</span>
          <span className="text-sm font-bold text-txt-primary">{offlineQueueCount}</span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border-default p-3 bg-bg-surface">
          <span className="text-sm font-semibold text-txt-primary">Downloaded Campers</span>
          <span className="text-sm font-bold text-teal-600">
            {engineStatus?.downloadedCampersCount ?? 0}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border-default p-3 bg-bg-surface">
          <span className="text-sm font-semibold text-txt-primary">Current Download Profile</span>
          <span className="text-sm text-txt-secondary font-medium">
            {engineStatus?.activeProfile || "FULL"} ({engineStatus?.activeScope || "ENTIRE_CAMP"})
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border-default p-3 bg-bg-surface">
          <span className="text-sm font-semibold text-txt-primary">Storage Used</span>
          <span className="text-sm text-txt-secondary font-medium">
            {formatSize(engineStatus?.storageEstimate?.usageBytes)} used (
            {formatSize(engineStatus?.storageEstimate?.remainingBytes)} free)
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border-default p-3 bg-bg-surface">
          <span className="text-sm font-semibold text-txt-primary">Last camper sync</span>
          <span className="text-sm text-txt-secondary">{lastCacheSyncTime}</span>
        </div>

        <div className="space-y-2 pt-2">
          <Button
            className="w-full"
            icon={<ArrowPathIcon className="h-4 w-4" />}
            loading={isSyncing}
            disabled={offlineQueueCount === 0 || !isOnline}
            onClick={onSyncNow}
          >
            Sync now
          </Button>

          <Button
            variant="secondary"
            className="w-full"
            icon={<CpuChipIcon className="h-4 w-4" />}
            loading={isRefreshingCache}
            onClick={() => {
              if (onOpenDownloadModal) {
                onClose();
                onOpenDownloadModal();
              } else {
                onRefreshCache();
              }
            }}
          >
            Download / Profile Options
          </Button>

          {onOpenReadiness && (
            <Button
              variant="ghost"
              className="w-full"
              icon={<CheckBadgeIcon className="h-4 w-4 text-emerald-600" />}
              onClick={() => {
                onClose();
                onOpenReadiness();
              }}
            >
              Pre-Camp Readiness Checklist
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
