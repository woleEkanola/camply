// Browser-native IndexedDB client database wrapper for offline storage.
// Enforces that it only runs on the client-side (Next.js context).

import { normalizeScannedQRToken } from "./qr";

const DB_NAME = "camply-offline-db";
const DB_VERSION = 2;

export type DownloadProfile = "FULL" | "CHECK_IN" | "FOOD" | "HOSTEL" | "TEACHER";
export type DownloadScope = "CURRENT_STATION" | "ASSIGNED_CAMPUS" | "SELECTED_CAMPUSES" | "ENTIRE_CAMP";

export interface OfflineCamper {
  registrationId: string;
  camperId?: string | null;
  registrationNumber: string;
  qrToken: string;
  name: string;
  photoUrl: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  medications?: string | null;
  dietaryRestrictions?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  relationship?: string | null;
  parentPhone?: string | null;
  teenPhone?: string | null;
  tribeName?: string | null;
  hostelName?: string | null;
  roomName?: string | null;
  bedLabel?: string | null;
  teacherName?: string | null;
  teacherPhone?: string | null;
  campusHOD?: string | null;
  campusHODPhone?: string | null;
  campusName?: string | null;
  updatedAt?: string | null;
}

export interface QueuedScan {
  id?: number;
  operationId: string; // UUID v4 for idempotency
  qrToken?: string;
  query?: string;
  station: string;
  stationId?: string;
  timestamp: string; // ISO string
  deviceId?: string;
  userId?: string;
  location?: string;
  retryCount?: number;
  syncedAt?: string | null;
  checkoutDetails?: {
    collectorName: string;
    collectorRelationship: string;
    details?: any;
  };
}

export interface SyncMetadata {
  key: string; // e.g. "activeSync"
  lastSyncedAt: string | null; // ISO timestamp
  profile: DownloadProfile;
  scope: DownloadScope;
  camperCount: number;
}

export function initDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db: IDBDatabase = event.target.result;

      // Store cached campers for fast offline lookup. Key by qrToken.
      let campersStore: IDBObjectStore;
      if (!db.objectStoreNames.contains("campers")) {
        campersStore = db.createObjectStore("campers", { keyPath: "qrToken" });
      } else {
        campersStore = event.target.transaction.objectStore("campers");
      }

      if (!campersStore.indexNames.contains("name")) {
        campersStore.createIndex("name", "name", { unique: false });
      }
      if (!campersStore.indexNames.contains("registrationNumber")) {
        campersStore.createIndex("registrationNumber", "registrationNumber", { unique: false });
      }
      if (!campersStore.indexNames.contains("parentPhone")) {
        campersStore.createIndex("parentPhone", "parentPhone", { unique: false });
      }
      if (!campersStore.indexNames.contains("teenPhone")) {
        campersStore.createIndex("teenPhone", "teenPhone", { unique: false });
      }
      if (!campersStore.indexNames.contains("registrationId")) {
        campersStore.createIndex("registrationId", "registrationId", { unique: false });
      }

      // Store offline scans to sync with server when connection returns
      if (!db.objectStoreNames.contains("scansQueue")) {
        const scansStore = db.createObjectStore("scansQueue", { keyPath: "id", autoIncrement: true });
        scansStore.createIndex("operationId", "operationId", { unique: true });
      }

      // Log today's scans locally to detect duplicates immediately even when offline
      if (!db.objectStoreNames.contains("localEventsCache")) {
        db.createObjectStore("localEventsCache", { keyPath: "key" });
      }

      // Sync metadata storage (lastSyncedAt, active profile, active scope)
      if (!db.objectStoreNames.contains("syncMeta")) {
        db.createObjectStore("syncMeta", { keyPath: "key" });
      }
    };

    request.onsuccess = (event: any) => {
      resolve(event.target.result);
    };

    request.onerror = (event: any) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    };
  });
}

export async function cacheCampers(campers: OfflineCamper[]): Promise<void> {
  const db = await initDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("campers", "readwrite");
    const store = transaction.objectStore("campers");

    const clearRequest = store.clear();

    clearRequest.onsuccess = () => {
      for (const camper of campers) {
        if (camper.qrToken) {
          store.put(camper);
        }
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = (event: any) => reject(event.target.error);
  });
}

/** Merges updated campers and removes deleted registration IDs (Delta Sync). */
export async function mergeDeltaCampers(
  updatedCampers: OfflineCamper[],
  deletedRegistrationIds: string[]
): Promise<number> {
  const db = await initDb();
  if (!db) return 0;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("campers", "readwrite");
    const store = transaction.objectStore("campers");

    // Put updated campers
    for (const camper of updatedCampers) {
      if (camper.qrToken) {
        store.put(camper);
      }
    }

    // Delete tombstones by registrationId index if needed
    if (deletedRegistrationIds.length > 0) {
      const regIdIndex = store.index("registrationId");
      for (const regId of deletedRegistrationIds) {
        const getReq = regIdIndex.getKey(regId);
        getReq.onsuccess = () => {
          if (getReq.result) {
            store.delete(getReq.result);
          }
        };
      }
    }

    transaction.oncomplete = () => {
      const countReq = store.count();
      countReq.onsuccess = () => resolve(countReq.result || 0);
      countReq.onerror = () => resolve(0);
    };
    transaction.onerror = (event: any) => reject(event.target.error);
  });
}

export async function getCamperCountOffline(): Promise<number> {
  const db = await initDb();
  if (!db) return 0;

  return new Promise((resolve) => {
    const transaction = db.transaction("campers", "readonly");
    const store = transaction.objectStore("campers");
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => resolve(0);
  });
}

export async function getCamperByToken(qrToken: string): Promise<OfflineCamper | null> {
  const db = await initDb();
  if (!db) return null;

  const normalized = normalizeScannedQRToken(qrToken);
  if (!normalized) return null;

  const directCamper = await new Promise<OfflineCamper | null>((resolve, reject) => {
    const transaction = db.transaction("campers", "readonly");
    const store = transaction.objectStore("campers");
    const request = store.get(normalized);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (event: any) => reject(event.target.error);
  });

  if (directCamper) return directCamper;

  // Fallback search by registrationNumber, camperId, or registrationId
  const searchResults = await searchCampersOffline(normalized);
  return searchResults.length > 0 ? searchResults[0] : null;
}

export async function searchCampersOffline(query: string, limit = 20): Promise<OfflineCamper[]> {
  const db = await initDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("campers", "readonly");
    const store = transaction.objectStore("campers");
    const request = store.openCursor();
    const results: OfflineCamper[] = [];
    const lowerQuery = query.toLowerCase().trim();

    request.onsuccess = (event: any) => {
      const cursor = event.target.result;
      if (cursor) {
        const camper: OfflineCamper = cursor.value;
        const matches =
          camper.name.toLowerCase().includes(lowerQuery) ||
          camper.registrationNumber.toLowerCase().includes(lowerQuery) ||
          (camper.parentPhone && camper.parentPhone.includes(lowerQuery)) ||
          (camper.teenPhone && camper.teenPhone.includes(lowerQuery)) ||
          (camper.emergencyContactPhone && camper.emergencyContactPhone.includes(lowerQuery));

        if (matches) {
          results.push(camper);
        }

        if (results.length >= limit) {
          resolve(results);
        } else {
          cursor.continue();
        }
      } else {
        resolve(results);
      }
    };

    request.onerror = (event: any) => reject(event.target.error);
  });
}

export async function enqueueScan(scan: QueuedScan): Promise<void> {
  const db = await initDb();
  if (!db) return;

  const enqueuePromise = new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("scansQueue", "readwrite");
    const store = transaction.objectStore("scansQueue");
    const request = store.add({
      ...scan,
      retryCount: scan.retryCount ?? 0,
      syncedAt: null,
    });

    request.onsuccess = () => resolve();
    request.onerror = (event: any) => reject(event.target.error);
  });

  const cacheKey = scan.qrToken
    ? `${scan.qrToken}-${scan.station.toLowerCase()}`
    : `${scan.query}-${scan.station.toLowerCase()}`;

  const recordLocalCachePromise = new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("localEventsCache", "readwrite");
    const store = transaction.objectStore("localEventsCache");
    const request = store.put({
      key: cacheKey,
      timestamp: scan.timestamp,
      station: scan.station,
      checkoutDetails: scan.checkoutDetails || null,
    });

    request.onsuccess = () => resolve();
    request.onerror = (event: any) => reject(event.target.error);
  });

  await Promise.all([enqueuePromise, recordLocalCachePromise]);
}

export async function getQueuedScans(): Promise<QueuedScan[]> {
  const db = await initDb();
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("scansQueue", "readonly");
    const store = transaction.objectStore("scansQueue");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (event: any) => reject(event.target.error);
  });
}

export async function clearQueuedScans(ids: number[]): Promise<void> {
  const db = await initDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("scansQueue", "readwrite");
    const store = transaction.objectStore("scansQueue");

    for (const id of ids) {
      store.delete(id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = (event: any) => reject(event.target.error);
  });
}

export async function checkLocalDuplicate(
  identifier: string,
  station: string
): Promise<{ originalTime: string; originalVolunteerName: string } | null> {
  const db = await initDb();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("localEventsCache", "readonly");
    const store = transaction.objectStore("localEventsCache");
    const cacheKey = `${identifier}-${station.toLowerCase()}`;
    const request = store.get(cacheKey);

    request.onsuccess = () => {
      if (request.result) {
        resolve({
          originalTime: request.result.timestamp,
          originalVolunteerName: "Self (Offline)",
        });
      } else {
        resolve(null);
      }
    };
    request.onerror = (event: any) => reject(event.target.error);
  });
}

export async function saveSyncMeta(meta: Omit<SyncMetadata, "key">): Promise<void> {
  const db = await initDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("syncMeta", "readwrite");
    const store = transaction.objectStore("syncMeta");
    const request = store.put({ key: "activeSync", ...meta });

    request.onsuccess = () => resolve();
    request.onerror = (event: any) => reject(event.target.error);
  });
}

export async function getSyncMeta(): Promise<SyncMetadata | null> {
  const db = await initDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const transaction = db.transaction("syncMeta", "readonly");
    const store = transaction.objectStore("syncMeta");
    const request = store.get("activeSync");

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

export async function clearLocalCache(): Promise<void> {
  const db = await initDb();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("localEventsCache", "readwrite");
    const store = transaction.objectStore("localEventsCache");
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = (event: any) => reject(event.target.error);
  });
}
