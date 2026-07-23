// Browser-native IndexedDB client database wrapper for offline storage.
// Enforces that it only runs on the client-side (Next.js context).

import { normalizeScannedQRToken } from "./qr";

const DB_NAME = "camply-offline-db";
const DB_VERSION = 1;

export interface OfflineCamper {
  registrationId: string;
  camperId?: string | null;
  registrationNumber: string;
  qrToken: string;
  name: string;
  photoUrl: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  medications: string | null;
  dietaryRestrictions: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  relationship: string | null;
  parentPhone: string | null;
  teenPhone: string | null;
  tribeName: string | null;
  hostelName: string | null;
  roomName: string | null;
  bedLabel: string | null;
  teacherName: string | null;
  teacherPhone: string | null;
  campusHOD?: string | null;
  campusHODPhone?: string | null;
  campusName: string | null;
}

export interface QueuedScan {
  id?: number;
  qrToken?: string;
  query?: string;
  station: string;
  timestamp: string; // ISO string
  device?: string;
  location?: string;
  checkoutDetails?: {
    collectorName: string;
    collectorRelationship: string;
    details?: any;
  };
}

export function initDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      
      // Store cached campers for fast offline lookup. Key by qrToken.
      if (!db.objectStoreNames.contains("campers")) {
        const campersStore = db.createObjectStore("campers", { keyPath: "qrToken" });
        campersStore.createIndex("name", "name", { unique: false });
        campersStore.createIndex("registrationNumber", "registrationNumber", { unique: false });
      }

      // Store offline scans to sync with server when connection returns
      if (!db.objectStoreNames.contains("scansQueue")) {
        db.createObjectStore("scansQueue", { keyPath: "id", autoIncrement: true });
      }

      // Log today's scans locally to detect duplicates immediately even when offline
      if (!db.objectStoreNames.contains("localEventsCache")) {
        db.createObjectStore("localEventsCache", { keyPath: "key" });
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
    const store = transaction.objectStore(transaction.objectStoreNames[0]);

    // Clear old records first
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

export async function searchCampersOffline(query: string): Promise<OfflineCamper[]> {
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
          (camper.parentPhone && camper.parentPhone.includes(lowerQuery));

        if (matches) {
          results.push(camper);
        }
        cursor.continue();
      } else {
        resolve(results.slice(0, 10)); // limit to 10 fallback results
      }
    };

    request.onerror = (event: any) => reject(event.target.error);
  });
}

export async function enqueueScan(scan: QueuedScan): Promise<void> {
  const db = await initDb();
  if (!db) return;

  // Add scan event to sync queue
  const enqueuePromise = new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("scansQueue", "readwrite");
    const store = transaction.objectStore("scansQueue");
    const request = store.add(scan);

    request.onsuccess = () => resolve();
    request.onerror = (event: any) => reject(event.target.error);
  });

  // Record locally in events cache
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
  identifier: string, // qrToken or query name
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
