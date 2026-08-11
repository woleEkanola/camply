import { useEffect, useState, useCallback } from "react";
import { api } from "@/utils/trpc";
import { offline } from "@/lib/offlineEngine";
import {
  getQueuedScans,
  clearQueuedScans,
  OfflineCamper,
} from "@/lib/offlineDb";

export function useOfflineScanner(organizationId: string) {
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const processScanMutation = api.scan.processScan.useMutation();
  const syncMutation = api.scan.bulkSyncOfflineScans.useMutation();

  const utils = api.useUtils();

  const updateQueueCount = useCallback(async () => {
    try {
      const queue = await getQueuedScans();
      setOfflineQueueCount(queue.length);
    } catch (err) {
      console.warn("Failed to check queue length:", err);
    }
  }, []);

  // Sync offline scans to the server
  const syncOfflineQueue = useCallback(async () => {
    if (isSyncing || typeof navigator === "undefined" || !navigator.onLine) return;
    try {
      const queue = await getQueuedScans();
      if (queue.length === 0) {
        setOfflineQueueCount(0);
        return;
      }

      setIsSyncing(true);
      console.log(`Syncing ${queue.length} offline scans...`);

      const response = await syncMutation.mutateAsync({
        organizationId,
        scans: queue.map((q) => ({
          operationId: q.operationId,
          qrToken: q.qrToken,
          query: q.query,
          station: q.station,
          stationId: q.stationId,
          timestamp: q.timestamp,
          device: q.deviceId,
          location: q.location,
          checkoutDetails: q.checkoutDetails,
        })),
      });

      console.log("Offline sync response:", response);

      const queuedIds = queue.map((q) => q.id).filter((id): id is number => id !== undefined);
      await clearQueuedScans(queuedIds);
      await updateQueueCount();

      utils.registration.getCheckInStats.invalidate();
      utils.scan.getOperationalStats.invalidate();
      utils.registration.lookupForCheckIn.invalidate();
    } catch (err) {
      console.error("Offline sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, organizationId, syncMutation, updateQueueCount, utils]);

  // Monitor online status & setup auto-sync triggers (online, visibility, periodic interval)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        syncOfflineQueue();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        syncOfflineQueue();
      }
    };

    setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Periodic 3-minute auto sync timer when online
    const interval = setInterval(() => {
      if (navigator.onLine) {
        syncOfflineQueue();
      }
    }, 3 * 60 * 1000);

    updateQueueCount();

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [syncOfflineQueue, updateQueueCount]);

  // Delta sync / refresh campers cache into IndexedDB
  const refreshCampersCache = async () => {
    try {
      const result = await utils.scan.getDeltaSyncData.fetch({
        organizationId,
        profile: "FULL",
        scope: "ENTIRE_CAMP",
      });

      if (result && result.updatedCampers) {
        const { mergeDeltaCampers, saveSyncMeta } = await import("@/lib/offlineDb");
        const count = await mergeDeltaCampers(result.updatedCampers, result.deletedRegistrationIds);
        await saveSyncMeta({
          lastSyncedAt: result.serverSyncTimestamp,
          profile: "FULL",
          scope: "ENTIRE_CAMP",
          camperCount: count,
        });
      }
    } catch (err) {
      console.error("Failed to populate offline campers cache:", err);
      throw err;
    }
  };

  // Execute scan online or offline
  const executeScan = async (params: {
    qrToken?: string;
    query?: string;
    station: string;
    stationId?: string;
    device?: string;
    location?: string;
    acknowledgedMedical?: boolean;
    skipMedicalAlerts?: boolean;
    checkoutDetails?: {
      collectorName: string;
      collectorRelationship: string;
      details?: any;
    };
  }) => {
    const timestamp = new Date();
    offline.setStation(params.station);

    if (navigator.onLine) {
      return await processScanMutation.mutateAsync({
        organizationId,
        ...params,
        timestamp,
      });
    }

    // OFFLINE PATH: resolve scan locally using Offline Engine
    let camper: OfflineCamper | null = null;

    if (params.qrToken) {
      camper = await offline.lookupQR(params.qrToken);
    } else if (params.query) {
      const searchResults = await offline.search(params.query, 1);
      camper = searchResults[0] || null;
    }

    if (!camper) {
      throw new Error(
        params.qrToken
          ? "Offline Error: Camper badge QR code is not cached. Please input name manually or reconnect."
          : "Offline Error: No camper matches search in cache."
      );
    }

    const identifier = params.qrToken || camper.name;
    const localDuplicate = await offline.checkDuplicate(identifier, params.station);

    const mockedRegistration = {
      id: camper.registrationId,
      registrationNumber: camper.registrationNumber,
      qrToken: camper.qrToken,
      status: "CHECKED_IN",
      camper: {
        id: camper.camperId ?? camper.registrationId,
        name: camper.name,
        photoUrl: camper.photoUrl,
        gender: camper.gender,
        dateOfBirth: camper.dateOfBirth,
        allergies: camper.allergies,
        medicalConditions: camper.medicalConditions,
        medications: camper.medications,
        dietaryRestrictions: camper.dietaryRestrictions,
        emergencyContactName: camper.emergencyContactName,
        emergencyContactPhone: camper.emergencyContactPhone,
        relationship: camper.relationship,
        parentPhone: camper.parentPhone,
        teenPhone: camper.teenPhone,
      },
      campus: { name: camper.campusName },
      camp: { name: "Offline Cached Camp" },
      tribe: { name: camper.tribeName },
      room: { name: camper.roomName, hostel: { name: camper.hostelName } },
      bed: { label: camper.bedLabel },
      teacher: { name: camper.teacherName },
    };

    if (localDuplicate) {
      return {
        result: "DUPLICATE" as const,
        message: `${params.station} already recorded offline.`,
        originalTime: new Date(localDuplicate.originalTime),
        originalVolunteerName: localDuplicate.originalVolunteerName,
        originalStation: params.station,
        registration: mockedRegistration,
      };
    }

    const stationLower = params.station.toLowerCase();

    if (stationLower === "checkout" && !params.checkoutDetails) {
      return {
        result: "REQUIRES_CHECKOUT_DETAILS" as const,
        registration: mockedRegistration,
      };
    }

    // Queue operation with UUID operationId
    await offline.queue({
      qrToken: camper.qrToken,
      query: params.query,
      station: params.station,
      stationId: params.stationId,
      timestamp: timestamp.toISOString(),
      location: params.location,
      checkoutDetails: params.checkoutDetails,
    });

    await updateQueueCount();

    return {
      result: "SUCCESS" as const,
      actionPerformed: stationLower === "checkout" ? "Checked Out (Offline)" : `Processed offline at ${params.station}`,
      registration: mockedRegistration,
    };
  };

  return {
    isOnline,
    offlineQueueCount,
    isSyncing,
    executeScan,
    syncOfflineQueue,
    refreshCampersCache,
  };
}
