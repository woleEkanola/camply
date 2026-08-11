"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { OfflineDownloadModal } from "@/components/scan/OfflineDownloadModal";
import { clearQueuedScans, getQueuedScans, getSyncMeta } from "@/lib/offlineDb";
import { offline } from "@/lib/offlineEngine";
import { cn } from "@/lib/cn";
import { api } from "@/utils/trpc";

interface OfflineDataNavButtonProps {
  organizationId: string;
  variant: "sidebar" | "menu";
  sidebarExpanded?: boolean;
}

function isInstalledPwa() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function OfflineDataNavButton({
  organizationId,
  variant,
  sidebarExpanded = true,
}: OfflineDataNavButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [camperCount, setCamperCount] = useState(0);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(false);
  const syncMutation = api.scan.bulkSyncOfflineScans.useMutation();

  const refreshAvailability = useCallback(async () => {
    const pwaInstalled = Boolean(organizationId) && isInstalledPwa();
    setInstalled(pwaInstalled);
    if (!pwaInstalled) {
      return;
    }

    const status = await offline.getStatus();
    setCamperCount(status.downloadedCampersCount);
    setPendingQueueCount(status.pendingQueueCount);
    setLastSyncedAt(status.lastSyncedAt);
  }, [organizationId]);

  const serverStatus = api.scan.getOfflineSyncStatus.useQuery(
    { organizationId, lastSyncedAt },
    {
      enabled: installed && camperCount > 0 && Boolean(lastSyncedAt) && online,
      refetchInterval: 2 * 60 * 1000,
      refetchOnWindowFocus: true,
    }
  );

  useEffect(() => {
    const handleInstalled = () => void refreshAvailability();
    const handleOfflineReady = () => {
      setModalOpen(false);
      void refreshAvailability();
    };
    const handleConnectionChange = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refreshAvailability();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshAvailability();
    };

    void refreshAvailability();
    setOnline(navigator.onLine);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("camply:offline-data-ready", handleOfflineReady);
    window.addEventListener("focus", handleInstalled);
    window.addEventListener("online", handleConnectionChange);
    window.addEventListener("offline", handleConnectionChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("camply:offline-data-ready", handleOfflineReady);
      window.removeEventListener("focus", handleInstalled);
      window.removeEventListener("online", handleConnectionChange);
      window.removeEventListener("offline", handleConnectionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshAvailability]);

  const action = !installed
    ? null
    : pendingQueueCount > 0
      ? "sync"
      : camperCount === 0
        ? "download"
        : !lastSyncedAt || serverStatus.data?.hasServerChanges
          ? "update"
          : null;

  const handleClick = async () => {
    if (action !== "sync") {
      setModalOpen(true);
      return;
    }

    if (!online) return;
    setSyncing(true);
    try {
      const queue = await getQueuedScans();
      await syncMutation.mutateAsync({
        organizationId,
        scans: queue.map((scan) => ({
          operationId: scan.operationId,
          qrToken: scan.qrToken,
          query: scan.query,
          station: scan.station,
          stationId: scan.stationId,
          timestamp: scan.timestamp,
          device: scan.deviceId,
          location: scan.location,
          checkoutDetails: scan.checkoutDetails,
        })),
      });
      const queuedIds = queue.map((scan) => scan.id).filter((id): id is number => id !== undefined);
      await clearQueuedScans(queuedIds);
      await refreshAvailability();
      setModalOpen(true);
    } finally {
      setSyncing(false);
    }
  };

  if (!action) return null;

  const label = syncing
    ? "Syncing Offline Data..."
    : action === "sync"
      ? online ? "Sync Offline Data" : "Sync When Online"
      : action === "update"
        ? "Update Offline Data"
        : "Download Offline Data";

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={syncing || (action === "sync" && !online)}
        className={cn(
          "font-semibold text-teal-600 transition hover:bg-teal-50 dark:hover:bg-teal-950/40",
          variant === "sidebar"
            ? "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm"
            : "flex w-full items-center gap-2 px-4 py-2 text-left text-sm"
        )}
      >
        <ArrowDownTrayIcon
          className={cn("shrink-0 text-teal-600", variant === "sidebar" ? "h-5 w-5" : "h-4 w-4")}
          aria-hidden="true"
        />
        <span className={cn(variant === "sidebar" && !sidebarExpanded && "hidden")}>
          {label}
        </span>
      </button>

      <OfflineDownloadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        organizationId={organizationId}
        operation={camperCount > 0 ? "update" : "download"}
        onSuccess={() => {
          setModalOpen(false);
          void refreshAvailability();
          void serverStatus.refetch();
        }}
      />
    </>
  );
}
