import { useEffect, useState } from "react";
import { api } from "@/utils/trpc";
import {
  enqueueScan,
  getQueuedScans,
  clearQueuedScans,
  checkLocalDuplicate,
  getCamperByToken,
  searchCampersOffline,
  cacheCampers,
  OfflineCamper,
  initDb,
} from "@/lib/offlineDb";

export function useOfflineScanner(organizationId: string) {
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const processScanMutation = api.scan.processScan.useMutation();
  const syncMutation = api.scan.bulkSyncOfflineScans.useMutation();
  
  // Existing query to fetch approved registrations for caching
  const utils = api.useUtils();

  // Monitor online status and sync queue when returning online
  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        syncOfflineQueue();
      }
    };

    setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Initial check of queue size
    updateQueueCount();

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  const updateQueueCount = async () => {
    try {
      const queue = await getQueuedScans();
      setOfflineQueueCount(queue.length);
    } catch (err) {
      console.warn("Failed to check queue length:", err);
    }
  };

  // Cache all approved campers into IndexedDB
  const refreshCampersCache = async () => {
    try {
      // Fetch registrations using trpc utils
      const regs = await utils.client.registration.getByOrganizationAndYear.query({
        organizationId,
      });

      const offlineCampers: OfflineCamper[] = (regs as any[])
        .filter((r) => r.status === "APPROVED" || r.status === "CHECKED_IN")
        .map((r) => {
          const c = r.camper;
          return {
            registrationId: r.id,
            camperId: c.id,
            registrationNumber: r.registrationNumber || "REG-NUM",
            qrToken: r.qrToken || "",
            name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
            photoUrl: c.photoUrl,
            gender: c.gender,
            dateOfBirth: c.dateOfBirth ? new Date(c.dateOfBirth).toISOString() : null,
            allergies: c.allergies,
            medicalConditions: c.medicalConditions,
            medications: c.medications,
            dietaryRestrictions: c.dietaryRestrictions,
            emergencyContactName: c.emergencyContactName,
            emergencyContactPhone: c.emergencyContactPhone,
            relationship: c.relationship,
            parentPhone: c.parentPhone,
            teenPhone: c.teenPhone,
            tribeName: r.tribe?.name || null,
            hostelName: r.room?.hostel?.name || null,
            roomName: r.room?.name || null,
            bedLabel: r.bed?.label || null,
            teacherName: r.teacherAssignments?.[0]?.staffProfile
              ? `${r.teacherAssignments[0].staffProfile.firstName} ${r.teacherAssignments[0].staffProfile.lastName}`
              : null,
            teacherPhone: r.teacherAssignments?.[0]?.staffProfile?.phone || null,
            campusName: r.campus?.name || null,
          };
        });

      await cacheCampers(offlineCampers);
      console.log(`Cached ${offlineCampers.length} campers offline.`);
    } catch (err) {
      console.error("Failed to populate offline campers cache:", err);
      throw err;
    }
  };

  // Sync offline scans to the server
  const syncOfflineQueue = async () => {
    if (isSyncing) return;
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
          qrToken: q.qrToken,
          query: q.query,
          station: q.station,
          timestamp: q.timestamp,
          device: q.device,
          location: q.location,
          checkoutDetails: q.checkoutDetails,
        })),
      });

      console.log("Offline sync response:", response);

      // Clear synced scans
      const queuedIds = queue.map((q) => q.id).filter((id): id is number => id !== undefined);
      await clearQueuedScans(queuedIds);
      await updateQueueCount();
      
      // Invalidate relevant client caches
      utils.registration.getCheckInStats.invalidate();
      utils.scan.getOperationalStats.invalidate();
      utils.registration.lookupForCheckIn.invalidate();
    } catch (err) {
      console.error("Offline sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Execute scan online or offline
  const executeScan = async (params: {
    qrToken?: string;
    query?: string;
    station: string;
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

    if (navigator.onLine) {
      // ONLINE PATH: execute server processScan mutation
      return await processScanMutation.mutateAsync({
        organizationId,
        ...params,
        timestamp,
      });
    }

    // OFFLINE PATH: resolve scan locally using IndexedDB
    let camper: OfflineCamper | null = null;

    if (params.qrToken) {
      camper = await getCamperByToken(params.qrToken);
    } else if (params.query) {
      const searchResults = await searchCampersOffline(params.query);
      camper = searchResults[0] || null;
    }

    if (!camper) {
      throw new Error(
        params.qrToken
          ? "Offline Error: Camper badge QR code is not cached. Please input name manually or reconnect."
          : "Offline Error: No camper matches search in cache."
      );
    }

    // Check for offline duplicate scan on this device
    const identifier = params.qrToken || camper.name;
    const localDuplicate = await checkLocalDuplicate(identifier, params.station);

    // Format output to look like Registration object returned by server
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

    // Checkout requires details check offline
    if (stationLower === "checkout" && !params.checkoutDetails) {
      return {
        result: "REQUIRES_CHECKOUT_DETAILS" as const,
        registration: mockedRegistration,
      };
    }

    // Write to offline queue
    await enqueueScan({
      qrToken: camper.qrToken,
      query: params.query,
      station: params.station,
      timestamp: timestamp.toISOString(),
      device: params.device,
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
