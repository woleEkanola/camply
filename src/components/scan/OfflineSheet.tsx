"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ArrowPathIcon, CpuChipIcon } from "@heroicons/react/24/outline";

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
}

/** Maintenance actions (sync/cache) are one tap away via the OfflineChip
 * instead of permanently occupying header space on every session. */
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
}: OfflineSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Sync & Offline Status">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border-default p-3">
          <span className="text-sm font-semibold text-txt-primary">Connection</span>
          <span className={`text-sm font-bold ${isOnline ? "text-success-700" : "text-warning-700"}`}>
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border-default p-3">
          <span className="text-sm font-semibold text-txt-primary">Scans waiting to sync</span>
          <span className="text-sm font-bold text-txt-primary">{offlineQueueCount}</span>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border-default p-3">
          <span className="text-sm font-semibold text-txt-primary">Last camper cache refresh</span>
          <span className="text-sm text-txt-secondary">{lastCacheSyncTime}</span>
        </div>

        <Button
          className="w-full"
          icon={<ArrowPathIcon className="h-4 w-4" />}
          loading={isSyncing}
          disabled={offlineQueueCount === 0}
          onClick={onSyncNow}
        >
          Sync now
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          icon={<CpuChipIcon className="h-4 w-4" />}
          loading={isRefreshingCache}
          onClick={onRefreshCache}
        >
          Refresh camper cache
        </Button>
      </div>
    </BottomSheet>
  );
}
