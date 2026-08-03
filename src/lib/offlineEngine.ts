/**
 * Central Offline Engine for Camply.
 * Encapsulates offline searching, QR lookups, action queuing, status reporting,
 * and readiness auditing so UI components call high-level methods:
 *   offline.search()
 *   offline.lookupQR()
 *   offline.queue()
 *   offline.getStatus()
 *   offline.getReadiness()
 */

import {
  getCamperByToken,
  searchCampersOffline,
  enqueueScan,
  getQueuedScans,
  getCamperCountOffline,
  getSyncMeta,
  saveSyncMeta,
  checkLocalDuplicate,
  OfflineCamper,
  QueuedScan,
  DownloadProfile,
  DownloadScope,
  SyncMetadata,
} from "./offlineDb";

export interface StorageEstimate {
  quotaBytes: number;
  usageBytes: number;
  remainingBytes: number;
  percentUsed: number;
  isPersistent: boolean;
}

export interface OfflineStatus {
  isOnline: boolean;
  lastSyncedAt: string | null;
  pendingQueueCount: number;
  downloadedCampersCount: number;
  activeProfile: DownloadProfile;
  activeScope: DownloadScope;
  storageEstimate: StorageEstimate | null;
}

export interface ReadinessChecklist {
  isAppInstalled: boolean;
  hasCameraPermission: boolean;
  isDatabaseDownloaded: boolean;
  isStorageAvailable: boolean;
  isStationSelected: boolean;
  lastSyncFormatted: string;
  pendingQueueCount: number;
  isReadyForOffline: boolean;
}

export class OfflineEngine {
  private isOnlineState: boolean = true;
  private activeStation: string | null = null;
  private currentDeviceId: string = "browser-client";

  constructor() {
    if (typeof window !== "undefined") {
      this.isOnlineState = navigator.onLine;
      window.addEventListener("online", () => {
        this.isOnlineState = true;
      });
      window.addEventListener("offline", () => {
        this.isOnlineState = false;
      });
      this.currentDeviceId = this.getOrCreateDeviceId();
    }
  }

  private getOrCreateDeviceId(): string {
    if (typeof window === "undefined") return "server-side";
    let deviceId = localStorage.getItem("camply_device_id");
    if (!deviceId) {
      deviceId = `dev_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
      localStorage.setItem("camply_device_id", deviceId);
    }
    return deviceId;
  }

  public setStation(stationName: string | null) {
    this.activeStation = stationName;
  }

  public getStation(): string | null {
    return this.activeStation;
  }

  public getDeviceId(): string {
    return this.currentDeviceId;
  }

  /** Direct QR lookup in local IndexedDB database. */
  public async lookupQR(qrToken: string): Promise<OfflineCamper | null> {
    return await getCamperByToken(qrToken);
  }

  /** Instant multi-field offline text search. */
  public async search(query: string, limit = 20): Promise<OfflineCamper[]> {
    if (!query.trim()) return [];
    return await searchCampersOffline(query, limit);
  }

  /** Enqueue scan with UUID operationId for idempotent background sync. */
  public async queue(scan: Omit<QueuedScan, "operationId"> & { operationId?: string }): Promise<QueuedScan> {
    const operationId = scan.operationId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    const queuedItem: QueuedScan = {
      ...scan,
      operationId,
      deviceId: scan.deviceId || this.currentDeviceId,
      timestamp: scan.timestamp || new Date().toISOString(),
      retryCount: 0,
      syncedAt: null,
    };
    await enqueueScan(queuedItem);
    return queuedItem;
  }

  /** Check for local duplicate scans on this device. */
  public async checkDuplicate(identifier: string, station: string) {
    return await checkLocalDuplicate(identifier, station);
  }

  /** Fetch comprehensive offline engine metrics for UI status drawers. */
  public async getStatus(): Promise<OfflineStatus> {
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : this.isOnlineState;
    const queue = await getQueuedScans();
    const camperCount = await getCamperCountOffline();
    const syncMeta = await getSyncMeta();
    const storageEstimate = await this.estimateStorage();

    return {
      isOnline,
      lastSyncedAt: syncMeta?.lastSyncedAt || null,
      pendingQueueCount: queue.length,
      downloadedCampersCount: camperCount,
      activeProfile: syncMeta?.profile || "FULL",
      activeScope: syncMeta?.scope || "ENTIRE_CAMP",
      storageEstimate,
    };
  }

  /** Evaluates pre-camp offline readiness checklist. */
  public async getReadiness(hasCameraPermission = false): Promise<ReadinessChecklist> {
    const status = await this.getStatus();
    const isAppInstalled = typeof window !== "undefined"
      ? window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true
      : false;

    const isDatabaseDownloaded = status.downloadedCampersCount > 0;
    const isStorageAvailable = status.storageEstimate ? status.storageEstimate.remainingBytes > 10 * 1024 * 1024 : true; // >10MB free
    const isStationSelected = Boolean(this.activeStation);

    const isReadyForOffline =
      isDatabaseDownloaded && isStorageAvailable && isStationSelected && status.pendingQueueCount === 0;

    let lastSyncFormatted = "Never";
    if (status.lastSyncedAt) {
      try {
        lastSyncFormatted = new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } catch {
        lastSyncFormatted = status.lastSyncedAt;
      }
    }

    return {
      isAppInstalled,
      hasCameraPermission,
      isDatabaseDownloaded,
      isStorageAvailable,
      isStationSelected,
      lastSyncFormatted,
      pendingQueueCount: status.pendingQueueCount,
      isReadyForOffline,
    };
  }

  /** Queries browser storage estimate & quota. */
  public async estimateStorage(): Promise<StorageEstimate | null> {
    if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.estimate) {
      return null;
    }
    try {
      const estimate = await navigator.storage.estimate();
      const quotaBytes = estimate.quota || 0;
      const usageBytes = estimate.usage || 0;
      const remainingBytes = Math.max(0, quotaBytes - usageBytes);
      const percentUsed = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;
      const isPersistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;

      return {
        quotaBytes,
        usageBytes,
        remainingBytes,
        percentUsed,
        isPersistent,
      };
    } catch (err) {
      console.warn("Storage estimation failed:", err);
      return null;
    }
  }

  /** Requests persistent browser storage so cache is never purged under pressure. */
  public async requestPersistence(): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
      try {
        return await navigator.storage.persist();
      } catch {
        return false;
      }
    }
    return false;
  }
}

export const offline = new OfflineEngine();
