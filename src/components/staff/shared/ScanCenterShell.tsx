"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { ScannerViewport } from "@/components/scan/ScannerViewport";
import { StationHeader } from "@/components/scan/StationHeader";
import { StationSheet } from "@/components/scan/StationSheet";
import { MedicalBanner } from "@/components/scan/MedicalBanner";
import { SearchSheet } from "@/components/scan/SearchSheet";
import { OfflineSheet } from "@/components/scan/OfflineSheet";
import { OfflineDownloadModal } from "@/components/scan/OfflineDownloadModal";
import { OfflineReadinessModal } from "@/components/pwa/OfflineReadinessModal";
import { notificationEngine } from "@/lib/notificationEngine";
import { HistorySheet } from "@/components/scan/HistorySheet";
import { ScanTabBar } from "@/components/scan/ScanTabBar";
import { CampusTeachersSheet } from "@/components/scan/CampusTeachersSheet";
import { CheckoutSignaturePad } from "./CheckoutSignaturePad";
import { useOfflineScanner } from "@/hooks/useOfflineScanner";
import { STATIONS, resolveInitialStation, getStationLabel, type StationId } from "@/lib/stations";
import { computeStationStats, computeStationProgress, EMPTY_SESSION_STATS, type SessionScanStats } from "@/lib/stationStats";
import { classifyMedical } from "@/lib/medical";
import { playScanCue, vibrateForCue } from "@/lib/scanCues";
import { normalizeScannedQRToken } from "@/lib/qr";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import { PhoneIcon } from "@heroicons/react/24/solid";
import { cn } from "@/lib/cn";

interface RecentScan {
  registrationId: string;
  scanEventId?: string;
  name: string;
  registrationNumber: string;
  station: string;
  timestamp: number;
}

export function ScanCenterShell({
  organizationId,
  defaultStationId,
  homeCampusId,
  pointsHref,
}: {
  organizationId: string;
  defaultStationId?: string;
  /** Signed-in staff member's own campus (TEACHER/VOLUNTEER only, via
   * StaffProfile.preferredCampusId) — pre-highlighted in the Pickup Point
   * campus picker. Admins have no personal campus and omit this. */
  homeCampusId?: string;
  /** Opens the role-appropriate Camp Points workspace without mixing point
   * awards into operational arrival, meal, medical, or checkout scans. */
  pointsHref?: string;
}) {
  const router = useRouter();
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // Active Station Configuration State. Resolution order: in-session pick >
  // route's defaultStationId > Identity Lookup (the only read-only mode) —
  // see resolveInitialStation in src/lib/stations.ts. There is no longer a
  // "no station selected" landing screen; the scanner is always live.
  const [activeStation, setActiveStation] = useState<StationId>(() =>
    resolveInitialStation({ routeDefault: (defaultStationId as StationId) ?? null, sessionPick: null })
  );
  const [stationSheetOpen, setStationSheetOpen] = useState(false);
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [offlineSheetOpen, setOfflineSheetOpen] = useState(false);
  const [offlineDownloadModalOpen, setOfflineDownloadModalOpen] = useState(false);
  const [offlineReadinessModalOpen, setOfflineReadinessModalOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [campusTeachersSheetOpen, setCampusTeachersSheetOpen] = useState(false);
  const [stationLocation, setStationLocation] = useState("");
  const [deviceIdentifier, setDeviceIdentifier] = useState("");
  const [customStationName, setCustomStationName] = useState("");
  const [sessionStats, setSessionStats] = useState<SessionScanStats>(EMPTY_SESSION_STATS);

  // Scan Popup Dismiss Mode: "MANUAL" (default, waits for X) vs "AUTO" (1.5s auto-dismiss)
  const [dismissMode, setDismissMode] = useState<"AUTO" | "MANUAL">(() => {
    if (typeof window === "undefined") return "MANUAL";
    const saved = localStorage.getItem("camply-scan-dismiss-mode");
    return saved === "AUTO" ? "AUTO" : "MANUAL";
  });

  const handleDismissModeChange = (mode: "AUTO" | "MANUAL") => {
    setDismissMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("camply-scan-dismiss-mode", mode);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [scannerActive, setScannerActive] = useState(true);
  const [lastCacheSyncTime, setLastCacheSyncTime] = useState<string>("Never");
  // Duplicate-token guard: ignore the same decoded token within 3s even
  // after the scanner resumes, so a badge left lingering in frame doesn't
  // re-fire the same scan repeatedly.
  const lastDecodedRef = useRef<{ token: string; at: number } | null>(null);

  // Hook for Offline capabilities
  const offlineScanner = useOfflineScanner(organizationId);
  useEffect(() => {
    if (offlineScanner.syncError) toast.error(offlineScanner.syncError);
  }, [offlineScanner.syncError]);
  const utils = api.useUtils();

  // Overlays & Dialogs State
  const [successData, setSuccessData] = useState<any>(null);
  const [duplicateData, setDuplicateData] = useState<any>(null);
  const [medicalData, setMedicalData] = useState<any>(null);
  const [lookupData, setLookupData] = useState<any>(null);
  const [emergencyLookupData, setEmergencyLookupData] = useState<any>(null);
  // Staff (teacher/volunteer) badge scan result — kept separate from the
  // camper overlays above rather than reusing them, since staff scans have
  // no camper/medical/checkout shape at all (see handleStaffScanSubmit).
  const [staffScanData, setStaffScanData] = useState<any>(null);

  // Checkout details form overlay state
  const [checkoutTargetReg, setCheckoutTargetReg] = useState<any>(null);
  const [collectorType, setCollectorType] = useState("PARENT");
  const [collectorName, setCollectorName] = useState("");
  const [collectorRelationship, setCollectorRelationship] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [parentPin, setParentPin] = useState("");

  // Recent scans checklist for quick undo (stored locally)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [timeTick, setTimeTick] = useState(Date.now());
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);

  // Stats query — feeds the always-visible per-station header tiles, so it
  // stays enabled regardless of which station is active (unlike the old
  // station-picker-only fetch).
  const { data: operationalStats, refetch: refetchStats } = api.scan.getOperationalStats.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const undoScanMutation = api.scan.undoScan.useMutation({
    onSuccess: (_, variables) => {
      setRecentScans((prev) =>
        prev.filter((s) =>
          variables.scanEventId
            ? s.scanEventId !== variables.scanEventId
            : s.registrationId !== variables.registrationId
        )
      );
      toast.success("Scan undone successfully — record cleared");
      refetchStats?.();
      setSuccessData(null);
      setScannerActive(true);
    },
    onError: (err) => {
      toast.error(`Failed to undo scan: ${err.message}`);
    },
  });

  // Device/desk settings persist across launches (they describe the
  // hardware, not the shift) via localStorage. The active station itself
  // is session-scoped (sessionStorage) — see resolveInitialStation above —
  // so a fresh launch/reload never silently carries yesterday's station
  // forward; it re-derives from the route or falls back to Identity Lookup.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedLocation = localStorage.getItem("camply-scan-location");
    const savedDevice = localStorage.getItem("camply-scan-device");
    const savedSync = localStorage.getItem("camply-scan-last-sync");

    const sessionPick = sessionStorage.getItem("camply-scan-station") as StationId | null;
    const savedCustom = sessionStorage.getItem("camply-scan-custom-name");
    const resolved = resolveInitialStation({ routeDefault: (defaultStationId as StationId) ?? null, sessionPick });
    setActiveStation(resolved);
    if (STATIONS[resolved].customSubName && savedCustom) setCustomStationName(savedCustom);

    if (savedLocation) setStationLocation(savedLocation);
    if (savedDevice) setDeviceIdentifier(savedDevice);
    if (savedSync) setLastCacheSyncTime(savedSync);
  }, [defaultStationId]);

  // Keep timers running to refresh "Undo" buttons
  useEffect(() => {
    const timer = setInterval(() => setTimeTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-dismiss success/duplicate overlays when dismissMode === "AUTO".
  // When dismissMode === "MANUAL" (default), popup stays on screen until user taps X.
  useEffect(() => {
    if (!successData || dismissMode === "MANUAL") return;
    const timer = setTimeout(() => {
      setSuccessData(null);
      setScannerActive(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [successData, dismissMode]);

  useEffect(() => {
    if (!duplicateData || dismissMode === "MANUAL") return;
    const timer = setTimeout(() => {
      setDuplicateData(null);
      setScannerActive(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, [duplicateData, dismissMode]);

  useEffect(() => {
    if (!staffScanData || dismissMode === "MANUAL") return;
    const timer = setTimeout(() => {
      setStaffScanData(null);
      setScannerActive(true);
    }, staffScanData.duplicate ? 2500 : 1500);
    return () => clearTimeout(timer);
  }, [staffScanData, dismissMode]);

  // Keyboard shortcut: slash key opens smart search, Escape closes overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !searchSheetOpen) {
        e.preventDefault();
        setSearchSheetOpen(true);
      }
      if (e.key === "Escape") {
        setSuccessData(null);
        setDuplicateData(null);
        setMedicalData(null);
        setLookupData(null);
        setEmergencyLookupData(null);
        setCheckoutTargetReg(null);
        setStaffScanData(null);
        // Dismissing any overlay by any means must resume scanning — this
        // was previously missed for Escape specifically, leaving the
        // camera visible but silently paused with nothing on screen to
        // explain why.
        setScannerActive(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Active station's display label — reuses the shared station registry so
  // the wire format sent to the scan router is unchanged.
  const activeStationDef = STATIONS[activeStation];
  const activeStationLabel = getStationLabel(activeStation, customStationName);

  const handleStationSelect = (stationId: StationId, subName?: string) => {
    setActiveStation(stationId);
    sessionStorage.setItem("camply-scan-station", stationId);
    if (subName !== undefined) {
      setCustomStationName(subName);
      sessionStorage.setItem("camply-scan-custom-name", subName);
    }
    // Camera is always live once a station is active — no launch button.
    setScannerActive(true);
  };

  const handleLocationChange = (val: string) => {
    setStationLocation(val);
    localStorage.setItem("camply-scan-location", val);
  };

  const handleDeviceChange = (val: string) => {
    setDeviceIdentifier(val);
    localStorage.setItem("camply-scan-device", val);
  };

  const handleOfflineCacheRefresh = async () => {
    setIsRefreshingCache(true);
    try {
      await offlineScanner.refreshCampersCache();
      const timeStr = new Date().toLocaleTimeString();
      setLastCacheSyncTime(timeStr);
      localStorage.setItem("camply-scan-last-sync", timeStr);
      toast.success("Offline database cached successfully!");
    } catch (err: any) {
      toast.error(`Cache update failed: ${err.message || "Ensure you are online."}`);
    } finally {
      setIsRefreshingCache(false);
    }
  };

  const staffScanMutation = api.scan.processStaffScan.useMutation();

  // Staff badge scans have their own request/response shape (no camper,
  // no medical triage, no checkout form) and write to StaffScanEvent, not
  // ScanEvent — kept as a fully separate path rather than folded into
  // handleScanSubmit below, which assumes a camper Registration throughout.
  // Deliberately does not go through useOfflineScanner — staff stations
  // require connectivity in this build.
  const handleStaffScanSubmit = async (payload: { qrToken?: string; query?: string }) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("Staff badge scanning requires connectivity to verify attendance and meal entitlement across devices.");
      setScannerActive(true);
      return;
    }
    setScannerActive(false);
    const targetStationName = activeStationLabel;
    try {
      const response = await staffScanMutation.mutateAsync({
        organizationId,
        qrToken: payload.qrToken,
        query: payload.query,
        station: targetStationName,
        stationId: activeStation,
        device: deviceIdentifier || undefined,
        location: stationLocation || undefined,
      });

      setSessionStats((prev) => ({ ...prev, scansToday: prev.scansToday + 1 }));

      if (response.result === "NOT_APPLICABLE") {
        playScanCue("duplicate");
        vibrateForCue("duplicate");
        setStaffScanData({ ...response, notApplicable: true, duplicate: false });
        return;
      }

      if (response.result === "DUPLICATE") {
        playScanCue("duplicate");
        vibrateForCue("duplicate");
        setSessionStats((prev) => ({ ...prev, duplicates: prev.duplicates + 1 }));
        setStaffScanData({ ...response, duplicate: true });
        return;
      }

      playScanCue("success");
      vibrateForCue("success");
      notificationEngine.notify({
        title: `${response.profile.firstName} ${response.profile.lastName}`.trim(),
        message: `${response.actionPerformed} at ${targetStationName}`,
        priority: "SUCCESS",
        source: targetStationName,
      });
      setStaffScanData({ ...response, duplicate: false });
    } catch (err: any) {
      toast.error(err.message || "Failed to process staff scan.");
      setScannerActive(true);
    }
  };

  // Perform the core scan operation
  const handleScanSubmit = async (payload: { qrToken?: string; query?: string; acknowledgedMedical?: boolean; checkoutDetails?: any }) => {
    const normalizedToken = normalizeScannedQRToken(payload.qrToken ?? "");
    if (normalizedToken.toUpperCase().startsWith("STF-") || activeStation === "STAFF_CHECK_IN" || activeStation === "STAFF_CHECKOUT") {
      return handleStaffScanSubmit(payload);
    }

    setScannerActive(false); // pause scanner while processing

    const targetStationName = activeStationLabel;

    try {
      const response = await offlineScanner.executeScan({
        qrToken: payload.qrToken,
        query: payload.query,
        station: targetStationName,
        stationId: activeStation,
        device: deviceIdentifier || undefined,
        location: stationLocation || undefined,
        acknowledgedMedical: payload.acknowledgedMedical,
        checkoutDetails: payload.checkoutDetails,
      });

      setSessionStats((prev) => ({ ...prev, scansToday: prev.scansToday + 1 }));

      // A. REQUIRES CHECKOUT FORM
      if (response.result === "REQUIRES_CHECKOUT_DETAILS") {
        setCheckoutTargetReg(response.registration);
        
        // Prep parent name as default collector
        const c = response.registration.camper;
        const parentUser = c?.user;
        const parentName = parentUser ? `${parentUser.firstName ?? ""} ${parentUser.lastName ?? ""}`.trim() : "";
        setCollectorType("PARENT");
        setCollectorName(parentName);
        setCollectorRelationship("Parent / Guardian");
        setSignatureData("");
        setParentPin("");
        return;
      }
 
      // B. REQUIRES MEDICAL ACKNOWLEDGEMENT (SERVER INTERCEPT) — always CRITICAL severity
      if (response.result === "REQUIRES_MEDICAL_ACKNOWLEDGEMENT") {
        playScanCue("critical");
        vibrateForCue("critical");
        notificationEngine.notify({
          title: "Medical Alert",
          message: `Critical medical flags for ${response.registration.camper.name}`,
          priority: "CRITICAL",
          source: targetStationName,
        });
        setMedicalData({
          registration: response.registration,
          qrToken: payload.qrToken,
          query: payload.query,
        });
        return;
      }

      // C. DUPLICATE SCAN
      if (response.result === "DUPLICATE") {
        playScanCue("duplicate");
        vibrateForCue("duplicate");
        notificationEngine.notify({
          title: "Duplicate Scan",
          message: `${response.registration.camper.name} already processed at ${response.originalStation}`,
          priority: "INFO",
          source: targetStationName,
        });
        setSessionStats((prev) => ({ ...prev, duplicates: prev.duplicates + 1 }));
        setDuplicateData({
          camperName: response.registration.camper.name,
          photoUrl: response.registration.camper.photoUrl,
          regNumber: response.registration.registrationNumber,
          originalTime: response.originalTime,
          originalVolunteerName: response.originalVolunteerName,
          originalStation: response.originalStation,
          message: response.message,
          metadata: response.metadata,
        });
        return;
      }

      // C. SUCCESS SCANS
      const reg = response.registration;
      const camper = reg.camper;

      notificationEngine.notify({
        title: camper.name,
        message: `${response.actionPerformed || "Checked In"} at ${targetStationName}`,
        priority: "SUCCESS",
        source: targetStationName,
      });

      // Handle Lookup Station Overlay
      if (activeStation === "IDENTITY_LOOKUP") {
        // Fetch scan history for the camper profile lookup
        let history: any[] = [];
        try {
          history = await utils.client.scan.getCamperScanHistory.query({ registrationId: reg.id });
        } catch {}

        const medical = classifyMedical(camper);
        setSessionStats((prev) => ({
          ...prev,
          lookups: prev.lookups + 1,
          medicalViewed: prev.medicalViewed + (medical.severity !== "NONE" ? 1 : 0),
        }));

        setLookupData({
          registration: reg,
          history,
        });
        return;
      }

      if (activeStation === "EMERGENCY_LOOKUP") {
        const medical = classifyMedical(camper);
        setSessionStats((prev) => ({
          ...prev,
          emergencyScans: prev.emergencyScans + 1,
          criticalAlerts: prev.criticalAlerts + (medical.severity === "CRITICAL" ? 1 : 0),
        }));
        setEmergencyLookupData(camper);
        return;
      }

      // Client-side medical severity fallback — only relevant offline,
      // where useOfflineScanner's mocked response never runs the server's
      // classification. Only CRITICAL blocks; INFO renders as an inline
      // banner in the success overlay below, never a separate interrupt.
      const medical = "medicalSeverity" in response && response.medicalSeverity
        ? { severity: response.medicalSeverity, flags: response.medicalFlags ?? [] }
        : classifyMedical(camper);
      if (activeStation !== "CHECKOUT" && medical.severity === "CRITICAL" && !payload.acknowledgedMedical) {
        setMedicalData({
          registration: reg,
          qrToken: payload.qrToken,
          query: payload.query,
        });
        return;
      }

      const scanEventId = (response as any).scanEventId;

      // Add to recent activity list
      setRecentScans((prev) => [
        {
          registrationId: reg.id,
          scanEventId,
          name: camper.name,
          registrationNumber: reg.registrationNumber,
          station: targetStationName,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 9),
      ]);

      // Show success overlay — auto-dismisses; a non-critical medical note
      // (if any) renders inline via MedicalBanner rather than interrupting.
      playScanCue("success");
      vibrateForCue("success");
      setSuccessData({
        scanEventId,
        registrationId: reg.id,
        camperName: camper.name,
        photoUrl: camper.photoUrl,
        regNumber: reg.registrationNumber,
        actionPerformed: response.actionPerformed || "Checked In",
        tribe: reg.tribe?.name,
        hostel: reg.room?.hostel?.name || reg.room?.hostelName,
        room: reg.room?.name,
        bed: reg.bed?.label,
        teacherName: reg.teacher?.name,
        medicalFlags: medical.severity === "INFO" ? medical.flags : [],
        camper,
      });

    } catch (err: any) {
      toast.error(err.message || "Failed to process scan.");
      setScannerActive(true);
    }
  };

  const handleScanSuccess = (decodedText: string) => {
    const now = Date.now();
    const last = lastDecodedRef.current;
    if (last && last.token === decodedText && now - last.at < 3000) return;
    lastDecodedRef.current = { token: decodedText, at: now };
    handleScanSubmit({ qrToken: decodedText });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    handleScanSubmit({ query: searchQuery.trim() });
    setSearchQuery("");
  };

  // Complete the checkout flow
  const handleConfirmCheckout = () => {
    if (!checkoutTargetReg) return;
    const regId = checkoutTargetReg.id;

    handleScanSubmit({
      qrToken: checkoutTargetReg.qrToken || undefined,
      query: checkoutTargetReg.qrToken ? undefined : checkoutTargetReg.camper.name,
      checkoutDetails: {
        collectorName,
        collectorRelationship,
        details: { signatureDataUrl: signatureData, verificationMethod: collectorType, pin: parentPin },
      },
    });

    setCheckoutTargetReg(null);
  };

  const handleGuardianChange = (val: string) => {
    setCollectorType(val);
    if (!checkoutTargetReg) return;

    const camperObj = checkoutTargetReg.camper;
    const parentUser = camperObj.user;
    const parentName = parentUser ? `${parentUser.firstName ?? ""} ${parentUser.lastName ?? ""}`.trim() : "";
    const emergencyName = camperObj.emergencyContactName || "";
    const emergencyRel = camperObj.relationship || "Emergency Contact";

    if (val === "PARENT") {
      setCollectorName(parentName);
      setCollectorRelationship("Parent / Guardian");
    } else if (val === "EMERGENCY") {
      setCollectorName(emergencyName);
      setCollectorRelationship(emergencyRel);
    } else {
      setCollectorName("");
      setCollectorRelationship("");
    }
  };

  const stationStats = computeStationStats(activeStation, activeStationDef.stats, operationalStats, sessionStats);
  const stationProgress = computeStationProgress(activeStation, operationalStats);

  return (
    <div data-scan-root className="mx-auto max-w-4xl space-y-6">
      {/* ═══ STATION DASHBOARD — the most obvious element on screen; always
          visible, color-coded per station, so a volunteer knows exactly
          which operational mode the device is in without reading anything. ═══ */}
      <div className="-mx-4 -mt-4 sm:mx-0 sm:mt-0 sm:rounded-xl overflow-hidden">
        <StationHeader
          station={activeStationDef}
          label={activeStationLabel}
          stats={stationStats}
          progress={stationProgress}
          onOpenSheet={() => setStationSheetOpen(true)}
        />
      </div>

      <StationSheet
        open={stationSheetOpen}
        onClose={() => setStationSheetOpen(false)}
        currentStationId={activeStation}
        onSelect={handleStationSelect}
        organizationId={organizationId}
        homeCampusId={homeCampusId}
        stationLocation={stationLocation}
        onLocationChange={handleLocationChange}
        deviceIdentifier={deviceIdentifier}
        onDeviceChange={handleDeviceChange}
        dismissMode={dismissMode}
        onDismissModeChange={handleDismissModeChange}
      />

      {/* Offline status & Popup mode — collapsed to single tappable chips */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOfflineSheetOpen(true)} className="cursor-pointer">
          <Badge tone={offlineScanner.isOnline ? "success" : "warning"}>
            <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
            {offlineScanner.isOnline ? "Online" : `Offline · ${offlineScanner.offlineQueueCount} waiting`}
          </Badge>
        </button>
        <button
          type="button"
          onClick={() => handleDismissModeChange(dismissMode === "MANUAL" ? "AUTO" : "MANUAL")}
          title={`Scan popup mode: ${dismissMode === "MANUAL" ? "Manual Close (Click X) - Default" : "Auto-dismiss (1.5s)"}`}
          className="cursor-pointer"
        >
          <Badge tone={dismissMode === "MANUAL" ? "attention" : "neutral"}>
            Popup: {dismissMode === "MANUAL" ? "Manual (X)" : "Auto (1.5s)"}
          </Badge>
        </button>
        {pointsHref && (
          <Button variant="secondary" size="sm" onClick={() => router.push(pointsHref)}>
            Award Camp Points
          </Button>
        )}
      </div>

      <OfflineSheet
        open={offlineSheetOpen}
        onClose={() => setOfflineSheetOpen(false)}
        isOnline={offlineScanner.isOnline}
        offlineQueueCount={offlineScanner.offlineQueueCount}
        isSyncing={offlineScanner.isSyncing}
        onSyncNow={() => offlineScanner.syncOfflineQueue()}
        isRefreshingCache={isRefreshingCache}
        onRefreshCache={handleOfflineCacheRefresh}
        lastCacheSyncTime={lastCacheSyncTime}
        onOpenDownloadModal={() => {
          setOfflineSheetOpen(false);
          setOfflineDownloadModalOpen(true);
        }}
        onOpenReadiness={() => {
          setOfflineSheetOpen(false);
          setOfflineReadinessModalOpen(true);
        }}
      />

      <OfflineDownloadModal
        open={offlineDownloadModalOpen}
        onClose={() => setOfflineDownloadModalOpen(false)}
        organizationId={organizationId}
        onSuccess={() => {
          const timeStr = new Date().toLocaleTimeString();
          setLastCacheSyncTime(timeStr);
          localStorage.setItem("camply-scan-last-sync", timeStr);
          toast.success("Offline camper database cached successfully!");
        }}
      />

      <OfflineReadinessModal
        open={offlineReadinessModalOpen}
        onClose={() => setOfflineReadinessModalOpen(false)}
        onOpenDownloadModal={() => {
          setOfflineReadinessModalOpen(false);
          setOfflineDownloadModalOpen(true);
        }}
      />

      <SearchSheet
        open={searchSheetOpen}
        onClose={() => setSearchSheetOpen(false)}
        onSearch={(query) => handleScanSubmit({ query })}
        onSelectCamper={(camper) =>
          handleScanSubmit({
            qrToken: camper.qrToken || undefined,
            query: camper.registrationNumber || camper.name,
          })
        }
        organizationId={organizationId}
      />

      <HistorySheet
        open={historySheetOpen}
        onClose={() => setHistorySheetOpen(false)}
        scans={recentScans}
        timeTick={timeTick}
        activeStation={activeStation}
        allowsUndo={activeStationDef.allowsUndo}
        isUndoing={undoScanMutation.isPending}
        onUndo={(scan) =>
          undoScanMutation.mutate({
            organizationId,
            scanEventId: scan.scanEventId,
            registrationId: scan.registrationId,
            station: scan.station,
          })
        }
      />

      <div className="space-y-6 animate-fade-in pb-20 md:pb-0">
        {/* Scanner Viewport — always live once a station is active, never
            gated behind a launch button; stays mounted through result
            overlays (paused, not stopped) so resuming is instant. */}
        <div className="max-w-md mx-auto w-full">
          <ScannerViewport
            enabled
            paused={!scannerActive}
            onDecode={handleScanSuccess}
            className="aspect-video md:aspect-square w-full rounded-xl border border-neutral-800 shadow-2xl"
          />
        </div>

        {/* Search is the exception path — smart search sheet with live auto-complete on mobile and desktop */}
        <Card
          className="hidden md:block border-border-default hover:border-accent-500 transition cursor-pointer shadow-xs"
          onClick={() => setSearchSheetOpen(true)}
        >
          <CardBody className="p-4">
            <div className="flex gap-3 items-center">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-txt-muted" />
                <Input
                  ref={searchInputRef}
                  readOnly
                  onFocus={() => setSearchSheetOpen(true)}
                  onClick={() => setSearchSheetOpen(true)}
                  containerClassName="w-full cursor-pointer"
                  className="pl-10 h-10 text-sm rounded-lg cursor-pointer bg-bg-surface dark:bg-neutral-900 border-border-default"
                  placeholder="Click or press [/] to search camper by name, registration #, or phone..."
                  value={searchQuery}
                />
                <span className="absolute right-3 top-2.5 text-xs text-txt-muted pointer-events-none hidden md:inline">
                  Press [/] for smart search
                </span>
              </div>
              <Button
                type="button"
                onClick={() => setSearchSheetOpen(true)}
                className="h-10 cursor-pointer px-5 font-bold"
              >
                Smart Search
              </Button>
            </div>
          </CardBody>
        </Card>

          {/* Compact recent-activity strip — last 4, auto-updates after
              every scan. Full session history + undo lives in HistorySheet
              via the "View all" trigger / History tab. */}
          {recentScans.length > 0 && (
            <Card className="border-border-default">
              <CardBody className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-txt-muted">Recent Activity</h3>
                  <button
                    type="button"
                    onClick={() => setHistorySheetOpen(true)}
                    className="text-xs font-bold text-accent-600 hover:underline"
                  >
                    View all
                  </button>
                </div>
                <div className="divide-y divide-neutral-100">
                  {recentScans.slice(0, 4).map((scan) => (
                    <div key={`${scan.registrationId}-${scan.timestamp}`} className="py-2.5 flex items-center justify-between text-sm">
                      <span className="font-bold text-neutral-900">{scan.name}</span>
                      <span className="text-xs text-neutral-500">
                        {scan.station} · {new Date(scan.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

      <ScanTabBar onHistory={() => setHistorySheetOpen(true)} onSearch={() => setSearchSheetOpen(true)} />

      {/* ═══ OVERLAY 1: SUCCESS FEEDBACK OVERLAY ═══ */}
      {successData && (
        <div
          onClick={() => {
            setSuccessData(null);
            setScannerActive(true);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-emerald-600 p-4 sm:p-6 text-white cursor-pointer animate-fade-in"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSuccessData(null);
              setScannerActive(true);
            }}
            className="fixed top-4 right-4 sm:top-6 sm:right-6 rounded-full bg-black/40 hover:bg-black/60 text-white p-3 backdrop-blur-md transition shadow-xl z-20 cursor-pointer border border-white/20"
            aria-label="Close popup"
          >
            <XMarkIcon className="h-7 w-7 stroke-2" />
          </button>

          <div className="min-h-full flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
            <div className="flex flex-col items-center max-w-lg w-full text-center space-y-6">
              <CheckCircleIcon className="h-24 w-24 md:h-32 md:w-32 animate-bounce" />
              
              <div className="space-y-2">
                <h1 className="text-4xl md:text-5xl font-black tracking-tight">{successData.actionPerformed}</h1>
                <p className="text-2xl md:text-3xl font-bold opacity-90">{successData.camperName}</p>
                <p className="text-sm font-semibold tracking-wider opacity-75 uppercase">{successData.regNumber}</p>
              </div>

              {successData.photoUrl && (
                <img
                  src={successData.photoUrl}
                  alt={successData.camperName}
                  className="h-44 w-44 rounded-2xl object-cover border-4 border-white/20 shadow-xl"
                />
              )}

              <div className="grid grid-cols-2 gap-4 w-full bg-surface/10 backdrop-blur rounded-xl p-4 text-left text-sm border border-white/10">
                {successData.tribe && (
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Tribe</span>
                    <span className="font-bold">{successData.tribe}</span>
                  </div>
                )}
                {successData.hostel && (
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Hostel</span>
                    <span className="font-bold">{successData.hostel}</span>
                  </div>
                )}
                {successData.room && (
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Room & Bed</span>
                    <span className="font-bold">{successData.room} / {successData.bed || "—"}</span>
                  </div>
                )}
                {successData.teacherName && (
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Teacher</span>
                    <span className="font-bold">{successData.teacherName}</span>
                  </div>
                )}
              </div>

              {successData.medicalFlags?.length > 0 && (
                <MedicalBanner flags={successData.medicalFlags} camper={successData.camper} />
              )}

              <div className="flex flex-col items-center gap-3 w-full pt-1">
                <button
                  type="button"
                  disabled={undoScanMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    undoScanMutation.mutate({
                      organizationId,
                      scanEventId: successData.scanEventId,
                      registrationId: successData.registrationId,
                      station: activeStationDef.name,
                    });
                  }}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white hover:bg-neutral-100 active:scale-95 text-emerald-950 font-bold text-sm shadow-xl transition border border-white/40 cursor-pointer disabled:opacity-50"
                >
                  <ArrowUturnLeftIcon className="h-4 w-4 stroke-2 text-emerald-950" />
                  {undoScanMutation.isPending ? "Undoing..." : "Undo this scan"}
                </button>

                <p className="text-xs opacity-75 font-medium">
                  {dismissMode === "MANUAL"
                    ? "Click (X) or tap anywhere to close and scan next"
                    : "Tap to dismiss now · resumes scanning automatically"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ OVERLAY 1b: STAFF BADGE SCAN RESULT ═══ */}
      {staffScanData && (
        <div
          onClick={() => {
            setStaffScanData(null);
            setScannerActive(true);
          }}
          className={cn(
            "fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 text-white cursor-pointer animate-fade-in",
            staffScanData.notApplicable ? "bg-amber-700" : staffScanData.duplicate ? "bg-blue-600" : "bg-sky-700"
          )}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setStaffScanData(null);
              setScannerActive(true);
            }}
            className="fixed top-4 right-4 sm:top-6 sm:right-6 rounded-full bg-black/40 hover:bg-black/60 text-white p-3 backdrop-blur-md transition shadow-xl z-20 cursor-pointer border border-white/20"
            aria-label="Close popup"
          >
            <XMarkIcon className="h-7 w-7 stroke-2" />
          </button>

          <div className="min-h-full flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
            <div className="flex flex-col items-center max-w-xl w-full text-center space-y-6">
              {staffScanData.notApplicable ? (
                <ExclamationTriangleIcon className="h-24 w-24 md:h-32 md:w-32" />
              ) : staffScanData.duplicate ? (
                <InformationCircleIcon className="h-24 w-24 md:h-32 md:w-32 animate-pulse" />
              ) : (
                <CheckCircleIcon className="h-24 w-24 md:h-32 md:w-32 animate-bounce" />
              )}

              <div className="space-y-2">
                <h1 className="text-4xl md:text-5xl font-black tracking-tight">
                  {staffScanData.actionPerformed ?? staffScanData.staffAction}
                </h1>
                <p className="text-2xl md:text-3xl font-bold opacity-95">
                  {`${staffScanData.profile.firstName} ${staffScanData.profile.lastName}`.trim()}
                  {staffScanData.profile.preferredName && (
                    <span className="text-lg md:text-xl font-normal opacity-80 block">
                      ("{staffScanData.profile.preferredName}")
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 border border-white/30">
                    {staffScanData.profile.type}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold",
                      (staffScanData.profile.attendanceIntent ?? "COMING") === "NOT_COMING"
                        ? "bg-rose-500/30 text-rose-200 border border-rose-400/40"
                        : "bg-emerald-500/30 text-emerald-100 border border-emerald-400/40"
                    )}
                  >
                    {(staffScanData.profile.attendanceIntent ?? "COMING") === "NOT_COMING" ? "Not Coming" : "Coming"}
                  </span>
                  <span className="text-xs font-semibold opacity-75 uppercase">
                    {staffScanData.profile.preferredCampus?.name ?? "—"}
                  </span>
                </div>
              </div>

              {staffScanData.message && (
                <p className="max-w-md text-base font-medium opacity-90">{staffScanData.message}</p>
              )}

              {/* Staff Photo / Initials Avatar */}
              {staffScanData.profile.photoUrl || staffScanData.profile.user?.photoUrl ? (
                <img
                  src={staffScanData.profile.photoUrl || staffScanData.profile.user?.photoUrl}
                  alt={`${staffScanData.profile.firstName} ${staffScanData.profile.lastName}`}
                  className="h-36 w-36 sm:h-44 sm:w-44 rounded-2xl object-cover border-4 border-white/20 shadow-xl"
                />
              ) : (
                <div className="h-28 w-28 sm:h-32 sm:w-32 rounded-2xl bg-surface/20 flex items-center justify-center text-4xl font-black shadow-lg border border-white/20">
                  {(staffScanData.profile.firstName?.[0] ?? "S").toUpperCase()}
                </div>
              )}

              {/* Rich 6-Card Metadata Grid matching Camper Popup */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full bg-surface/10 backdrop-blur rounded-xl p-4 sm:p-5 text-left text-sm border border-white/10">
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Department</span>
                  <span className="font-bold text-white block">
                    {staffScanData.profile.department?.name || staffScanData.profile.preferredDepartment?.name || "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Position / Role</span>
                  <span className="font-bold text-white block truncate">
                    {staffScanData.profile.positionAssignments?.[0]?.position?.name ||
                      (staffScanData.profile.isDepartmentHead ? "Department Head" :
                       staffScanData.profile.isCampMonitor ? "Camp Monitor" :
                       staffScanData.profile.workerStatus || "General Staff")}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Tribe</span>
                  <span className="font-bold text-white block">
                    {staffScanData.profile.assignedTribe?.name || "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Hostel & Room / Bed</span>
                  <span className="font-bold text-white block truncate">
                    {staffScanData.profile.assignedRoom?.hostel?.name || staffScanData.profile.assignedHostel?.name || "—"}
                    {staffScanData.profile.assignedRoom?.name ? ` · ${staffScanData.profile.assignedRoom.name}` : ""}
                    {staffScanData.profile.assignedBed?.label ? ` (Bed ${staffScanData.profile.assignedBed.label})` : ""}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Campus</span>
                  <span className="font-bold text-white block">{staffScanData.profile.preferredCampus?.name || "—"}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Church / Ministry</span>
                  <span className="font-bold text-white truncate block">
                    {staffScanData.profile.church || "—"}
                    {staffScanData.profile.churchDepartment ? ` (${staffScanData.profile.churchDepartment})` : ""}
                  </span>
                </div>
              </div>

              {/* Medical & Safety Alerts Banner */}
              {(staffScanData.profile.allergies || staffScanData.profile.medicalConditions) && (
                <div className="w-full bg-red-500/20 border border-red-400/30 backdrop-blur rounded-xl p-4 text-left space-y-1.5 shadow-lg">
                  <span className="block text-xs uppercase tracking-wider font-black text-red-200">⚠ Medical & Allergy Alert</span>
                  {staffScanData.profile.allergies && (
                    <div className="text-sm">
                      <span className="opacity-80">Allergies:</span>{" "}
                      <span className="font-bold text-white">{staffScanData.profile.allergies}</span>
                    </div>
                  )}
                  {staffScanData.profile.medicalConditions && (
                    <div className="text-sm">
                      <span className="opacity-80">Conditions:</span>{" "}
                      <span className="font-bold text-white">{staffScanData.profile.medicalConditions}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Staff Phone & Emergency Contacts with Direct Call Actions */}
              <div className="w-full bg-surface/10 backdrop-blur rounded-xl p-4 text-left space-y-3 border border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Staff Phone</span>
                    <span className="block font-bold truncate text-sm">{staffScanData.profile.phone || "—"}</span>
                  </div>
                  {staffScanData.profile.phone && (
                    <a
                      href={`tel:${staffScanData.profile.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:scale-95 px-3 py-2 text-xs font-bold text-white min-h-[38px] shrink-0 shadow transition"
                    >
                      <PhoneIcon className="h-3.5 w-3.5" />
                      Call Staff
                    </a>
                  )}
                </div>

                {(staffScanData.profile.emergencyContactName || staffScanData.profile.emergencyContactPhone) && (
                  <div className="border-t border-white/10 pt-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Emergency Contact</span>
                      <span className="block font-bold truncate text-sm">
                        {staffScanData.profile.emergencyContactName || "—"}
                        {staffScanData.profile.emergencyContactRelationship ? ` (${staffScanData.profile.emergencyContactRelationship})` : ""}
                      </span>
                      {staffScanData.profile.emergencyContactPhone && (
                        <span className="block text-xs opacity-80">{staffScanData.profile.emergencyContactPhone}</span>
                      )}
                    </div>
                    {staffScanData.profile.emergencyContactPhone && (
                      <a
                        href={`tel:${staffScanData.profile.emergencyContactPhone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 rounded-lg bg-red-500 hover:bg-red-600 active:scale-95 px-3 py-2 text-xs font-bold text-white min-h-[38px] shrink-0 shadow transition"
                      >
                        <PhoneIcon className="h-3.5 w-3.5" />
                        Call Contact
                      </a>
                    )}
                  </div>
                )}
              </div>

              {staffScanData.scanEventId && (
                <div className="flex flex-col items-center gap-3 w-full pt-1">
                  <button
                    type="button"
                    disabled={undoScanMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      undoScanMutation.mutate({
                        organizationId,
                        scanEventId: staffScanData.scanEventId,
                        station: staffScanData.profile?.type ? `${staffScanData.profile.type} Scan` : "Staff Scan",
                      });
                    }}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white hover:bg-neutral-100 active:scale-95 text-neutral-900 font-bold text-sm shadow-xl transition border border-white/40 cursor-pointer disabled:opacity-50"
                  >
                    <ArrowUturnLeftIcon className="h-4 w-4 stroke-2 text-neutral-900" />
                    {undoScanMutation.isPending ? "Undoing..." : "Undo this scan"}
                  </button>
                </div>
              )}

              <p className="text-xs opacity-75 font-medium">
                {dismissMode === "MANUAL"
                  ? "Click (X) or tap anywhere to close and scan next"
                  : "Tap to dismiss now · resumes scanning automatically"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ OVERLAY 2: BLUE DUPLICATE STATUS OVERLAY (NOT FAILURE) ═══ */}
      {duplicateData && (
        <div
          onClick={() => {
            setDuplicateData(null);
            setScannerActive(true);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-blue-600 p-4 sm:p-6 text-white cursor-pointer animate-fade-in"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDuplicateData(null);
              setScannerActive(true);
            }}
            className="fixed top-4 right-4 sm:top-6 sm:right-6 rounded-full bg-black/40 hover:bg-black/60 text-white p-3 backdrop-blur-md transition shadow-xl z-20 cursor-pointer border border-white/20"
            aria-label="Close popup"
          >
            <XMarkIcon className="h-7 w-7 stroke-2" />
          </button>

          <div className="min-h-full flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
            <div className="flex flex-col items-center max-w-lg w-full text-center space-y-6">
              <InformationCircleIcon className="h-24 w-24 md:h-32 md:w-32 animate-pulse" />
              
              <div className="space-y-2">
                <h1 className="text-4xl md:text-5xl font-black tracking-tight">{STATIONS[activeStation].duplicateVerb}</h1>
                <p className="text-2xl md:text-3xl font-bold opacity-90">{duplicateData.camperName}</p>
                <p className="text-sm font-semibold tracking-wider opacity-75 uppercase">{duplicateData.regNumber}</p>
              </div>

              {duplicateData.photoUrl && (
                <img
                  src={duplicateData.photoUrl}
                  alt={duplicateData.camperName}
                  className="h-44 w-44 rounded-2xl object-cover border-4 border-white/20 shadow-xl"
                />
              )}

              <div className="bg-surface/10 backdrop-blur rounded-xl p-5 text-left text-sm border border-white/10 space-y-3 w-full">
                {duplicateData.message && (
                  <div className="text-white font-bold text-sm bg-surface/10 rounded-lg p-2.5 mb-2">
                    {duplicateData.message}
                  </div>
                )}
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Original Activity</span>
                  <span className="font-bold text-lg">{duplicateData.originalStation}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Time processed</span>
                    <span className="font-bold">{new Date(duplicateData.originalTime).toLocaleTimeString()}</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Processed By</span>
                    <span className="font-bold">{duplicateData.originalVolunteerName}</span>
                  </div>
                </div>

                {duplicateData.metadata?.collectorName && (
                  <div className="border-t border-white/10 pt-2 mt-2">
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Collected By</span>
                    <span className="font-bold">
                      {duplicateData.metadata.collectorName} ({duplicateData.metadata.relationship})
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs opacity-75 font-medium">
                {dismissMode === "MANUAL"
                  ? "Click (X) or tap anywhere to close and scan next"
                  : "Tap to dismiss now · resumes scanning automatically"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ OVERLAY 3: EMERGENCY LOOKUP OVERLAY ═══ */}
      {emergencyLookupData && (
        <div
          onClick={() => {
            setEmergencyLookupData(null);
            setScannerActive(true);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-red-700 p-4 sm:p-6 text-white cursor-pointer animate-fade-in"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEmergencyLookupData(null);
              setScannerActive(true);
            }}
            className="fixed top-4 right-4 sm:top-6 sm:right-6 rounded-full bg-black/40 hover:bg-black/60 text-white p-3 backdrop-blur-md transition shadow-xl z-20 cursor-pointer border border-white/20"
            aria-label="Close popup"
          >
            <XMarkIcon className="h-7 w-7 stroke-2" />
          </button>

          <div className="min-h-full flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
            <div className="flex flex-col max-w-xl w-full text-center space-y-6">
              <div className="flex flex-col items-center space-y-2">
                <ExclamationTriangleIcon className="h-20 w-20 text-red-200 animate-bounce" />
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">⚠ Emergency lookup</h1>
                <p className="text-2xl md:text-3xl font-black text-red-50">{emergencyLookupData.name}</p>
              </div>

              {emergencyLookupData.photoUrl && (
                <div className="flex justify-center">
                  <img
                    src={emergencyLookupData.photoUrl}
                    alt={emergencyLookupData.name}
                    className="h-44 w-44 rounded-2xl object-cover border-4 border-white/20 shadow-xl"
                  />
                </div>
              )}

              <div className="bg-surface/10 backdrop-blur rounded-xl p-5 text-left space-y-4 border border-white/10 text-base">
                <div>
                  <span className="block text-xs uppercase opacity-85 font-black text-red-200">Medical Conditions</span>
                  <span className="font-black text-2xl text-white block mt-0.5">
                    {emergencyLookupData.medicalConditions || "No medical conditions recorded"}
                  </span>
                </div>
                
                <div>
                  <span className="block text-xs uppercase opacity-85 font-black text-red-200">Allergies</span>
                  <span className="font-black text-2xl text-white block mt-0.5">
                    {emergencyLookupData.allergies || "No allergies recorded"}
                  </span>
                </div>

                {emergencyLookupData.medications && (
                  <div>
                    <span className="block text-xs uppercase opacity-85 font-black text-red-200">Medications</span>
                    <span className="font-bold text-white block">{emergencyLookupData.medications}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Emergency Contact</span>
                    <span className="font-bold text-sm block">
                      {emergencyLookupData.emergencyContactName || "—"} ({emergencyLookupData.relationship || "Guardian"})
                    </span>
                    <span className="font-bold text-sm block">{emergencyLookupData.emergencyContactPhone || "—"}</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Parent Phone</span>
                    <span className="font-bold text-sm block">{emergencyLookupData.parentPhone || "—"}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs opacity-60">Tapping anywhere will return to scanning</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ OVERLAY 4: CAMPER DETAILS LOOKUP OVERLAY ═══ */}
      {lookupData && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-purple-900 p-4 sm:p-6 text-white animate-fade-in">
          <button
            type="button"
            onClick={() => {
              setLookupData(null);
              setScannerActive(true);
            }}
            aria-label="Close"
            className="fixed right-4 top-4 sm:right-6 sm:top-6 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          <div className="min-h-full flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
            <div className="flex flex-col max-w-xl w-full space-y-6 text-left">
              <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                {lookupData.registration.camper.photoUrl ? (
                  <img
                    src={lookupData.registration.camper.photoUrl}
                    alt={lookupData.registration.camper.name}
                    className="h-32 w-32 rounded-2xl object-cover border-2 border-white/20 shadow-md shrink-0"
                  />
                ) : (
                  <div className="h-32 w-32 rounded-2xl bg-surface/15 flex items-center justify-center text-4xl font-black shrink-0">
                    {lookupData.registration.camper.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-black text-white">{lookupData.registration.camper.name}</h1>
                  <p className="text-xs font-semibold tracking-wider text-purple-200 uppercase">
                    {lookupData.registration.registrationNumber}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm bg-surface/5 rounded-xl p-4 border border-white/10">
                <div>
                  <span className="block text-xs uppercase opacity-60 font-semibold">Tribe</span>
                  <span className="font-bold text-purple-50">{lookupData.registration.tribe?.name || "—"}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-60 font-semibold">Hostel & Room</span>
                  <span className="font-bold text-purple-50">
                    {lookupData.registration.room?.hostel?.name || "—"} / {lookupData.registration.room?.name || "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-60 font-semibold">Teacher</span>
                  <span className="font-bold text-purple-50">{lookupData.registration.teacher?.name || "—"}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-60 font-semibold">Campus</span>
                  <span className="font-bold text-purple-50">{lookupData.registration.campus?.name || "—"}</span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-60 font-semibold">DOB & Gender</span>
                  <span className="font-bold text-purple-50">
                    {lookupData.registration.camper.dateOfBirth
                      ? new Date(lookupData.registration.camper.dateOfBirth).toLocaleDateString()
                      : "—"}{" "}
                    / {lookupData.registration.camper.gender || "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-xs uppercase opacity-60 font-semibold">Current Status</span>
                  <Badge tone="success" className="bg-emerald-500/20 text-emerald-300 border-none font-bold mt-0.5">
                    {lookupData.registration.status}
                  </Badge>
                </div>
              </div>

              {/* Medical Info in lookup */}
              {(lookupData.registration.camper.allergies || lookupData.registration.camper.medicalConditions) && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-2">
                  <span className="block text-xs uppercase text-red-300 font-bold">⚠ Medical & safety alert</span>
                  <div className="text-xs space-y-1">
                    {lookupData.registration.camper.allergies && (
                      <div><span className="opacity-80">Allergies:</span> <span className="font-bold text-red-200">{lookupData.registration.camper.allergies}</span></div>
                    )}
                    {lookupData.registration.camper.medicalConditions && (
                      <div><span className="opacity-80">Conditions:</span> <span className="font-bold text-red-200">{lookupData.registration.camper.medicalConditions}</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Timelines of checkin events */}
              <div className="space-y-3">
                <span className="block text-xs uppercase opacity-65 font-bold">Operational Timeline</span>
                <div className="space-y-2.5 max-h-48 overflow-y-auto">
                  {lookupData.history && lookupData.history.length > 0 ? (
                    lookupData.history.map((h: any) => (
                      <div key={h.id} className="flex gap-3 text-xs bg-surface/5 border border-white/5 rounded-lg p-2.5">
                        <span className="font-black text-purple-300">{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="flex-1">
                          <span className="font-bold block text-white">{h.station}</span>
                          <span className="opacity-60 block">Result: {h.result} · By: {h.volunteerName}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs opacity-50">No scan history recorded.</p>
                  )}
                </div>
              </div>

              {/* Campus rep contact + full teacher list */}
              {lookupData.registration.campus?.id && (
                <div className="border-t border-white/10 pt-4 space-y-3">
                  <span className="block text-xs uppercase opacity-65 font-bold">Campus Contacts</span>
                  {(lookupData.registration.campus.reps ?? []).length === 0 && (
                    <p className="text-xs opacity-50">No campus rep on file.</p>
                  )}
                  {(lookupData.registration.campus.reps ?? []).map((rep: any) => {
                    const repName = [rep.firstName, rep.lastName].filter(Boolean).join(" ") || "Campus Rep";
                    const repPhone = rep.phone || rep.staffProfiles?.[0]?.phone || lookupData.registration.campus?.phone;
                    return (
                      <div key={rep.id} className="flex items-center justify-between gap-3 bg-surface/5 border border-white/5 rounded-lg p-3">
                        <div className="min-w-0">
                          <span className="block text-xs uppercase opacity-60 font-semibold">Campus Rep</span>
                          <span className="block font-bold truncate">{repName}</span>
                        </div>
                        {repPhone ? (
                          <a
                            href={`tel:${repPhone}`}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-bold text-white min-h-[44px] shrink-0"
                          >
                            <PhoneIcon className="h-4 w-4" />
                            Call
                          </a>
                        ) : (
                          <span className="text-xs opacity-50 shrink-0">No phone on file</span>
                        )}
                      </div>
                    );
                  })}

                  <Button
                    variant="secondary"
                    className="w-full bg-transparent hover:bg-surface/10 text-white border border-white/20"
                    onClick={() => setCampusTeachersSheetOpen(true)}
                  >
                    More — View campus teachers
                  </Button>
                </div>
              )}

              <p className="text-xs text-center opacity-40">Tap the X to return to scanning</p>
            </div>
          </div>
        </div>
      )}

      {lookupData?.registration.campus?.id && (
        <CampusTeachersSheet
          open={campusTeachersSheetOpen}
          onClose={() => setCampusTeachersSheetOpen(false)}
          organizationId={organizationId}
          campusId={lookupData.registration.campus.id}
          campusName={lookupData.registration.campus.name}
        />
      )}

      {/* ═══ OVERLAY 5: CRITICAL MEDICAL INTERRUPT ═══ */}
      {medicalData && (
        <div role="alertdialog" aria-live="assertive" className="fixed inset-0 z-50 overflow-y-auto bg-red-700 p-4 sm:p-6 text-white animate-fade-in">
          <div className="min-h-full flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
            <div className="flex flex-col max-w-xl w-full text-center space-y-6">
              <div className="flex flex-col items-center space-y-3">
                <ExclamationTriangleIcon className="h-20 w-20 text-red-100 animate-bounce" />
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">⚠ Critical Medical Alert</h1>
                <p className="text-xl md:text-2xl font-bold opacity-95">{medicalData.registration.camper.name}</p>
              </div>

              <div className="bg-surface/10 backdrop-blur rounded-xl p-4 text-left space-y-4 border border-white/10 text-sm md:text-base">
                {medicalData.registration.camper.allergies && (
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Allergies</span>
                    <span className="font-bold text-lg text-red-50">{medicalData.registration.camper.allergies}</span>
                  </div>
                )}
                {medicalData.registration.camper.medicalConditions && (
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Medical Conditions</span>
                    <span className="font-bold text-lg text-red-50">{medicalData.registration.camper.medicalConditions}</span>
                  </div>
                )}
                {medicalData.registration.camper.dietaryRestrictions && (
                  <div>
                    <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Dietary Restrictions</span>
                    <span className="font-bold">{medicalData.registration.camper.dietaryRestrictions}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full">
                <Button
                  size="lg"
                  className="flex-1 bg-surface text-red-700 hover:bg-surface-raised font-bold py-4 text-base border-none shadow-lg"
                  onClick={() => {
                    const payload = {
                      qrToken: medicalData.qrToken,
                      query: medicalData.query,
                      acknowledgedMedical: true,
                    };
                    setMedicalData(null);
                    handleScanSubmit(payload);
                  }}
                >
                  Acknowledge & Confirm Scan
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="flex-1 bg-transparent hover:bg-surface/10 text-white font-bold py-4 text-base border border-white/40"
                  onClick={() => {
                    setMedicalData(null);
                    setScannerActive(true);
                  }}
                >
                  Cancel & Go Back
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ OVERLAY 6: SECURE CHECKOUT GUARDIAN FORM OVERLAY ═══ */}
      {checkoutTargetReg && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-blue-900 p-4 sm:p-6 text-white animate-fade-in">
          <div className="min-h-full flex flex-col items-center justify-center py-12 sm:py-16 md:py-20">
            <div className="flex flex-col max-w-xl w-full space-y-6 text-left">
              
              <div className="flex items-center gap-4 border-b border-white/15 pb-4">
                {checkoutTargetReg.camper.photoUrl ? (
                  <img
                    src={checkoutTargetReg.camper.photoUrl}
                    alt={checkoutTargetReg.camper.name}
                    className="h-16 w-16 rounded-xl object-cover border-2 border-white/20"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-surface/15 flex items-center justify-center text-2xl font-black">
                    {checkoutTargetReg.camper.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-black text-white">Checkout: {checkoutTargetReg.camper.name}</h1>
                  <p className="text-xs text-blue-200">Verify guardian identity and obtain signature</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Approved Guardians"
                    value={collectorType}
                    onChange={(e) => handleGuardianChange(e.target.value)}
                    className="text-neutral-900 bg-surface"
                  >
                    <option value="PARENT">Parent/Guardian</option>
                    {checkoutTargetReg.camper.emergencyContactName && (
                      <option value="EMERGENCY">Emergency ({checkoutTargetReg.camper.emergencyContactName})</option>
                    )}
                    <option value="OTHER">Other collector...</option>
                  </Select>

                  <Input
                    label="Collector Name"
                    placeholder="Guardian full name..."
                    value={collectorName}
                    onChange={(e) => setCollectorName(e.target.value)}
                    className="text-neutral-950 bg-surface"
                    disabled={collectorType !== "OTHER"}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Relationship to Camper"
                    placeholder="e.g. Uncle, Aunt, Driver"
                    value={collectorRelationship}
                    onChange={(e) => setCollectorRelationship(e.target.value)}
                    className="text-neutral-950 bg-surface"
                    disabled={collectorType !== "OTHER"}
                    required
                  />
                  
                  <Input
                    label="Parent collection PIN (Optional)"
                    placeholder="Verification code..."
                    type="password"
                    value={parentPin}
                    onChange={(e) => setParentPin(e.target.value)}
                    className="text-neutral-950 bg-surface"
                  />
                </div>

                {/* Canvas Signature Pad */}
                <div className="space-y-1.5">
                  <span className="block text-xs font-bold text-blue-200">Guardian Signature Capture</span>
                  <CheckoutSignaturePad
                    onSave={(dataUrl) => setSignatureData(dataUrl)}
                    onClear={() => setSignatureData("")}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-2">
                <Button
                  size="lg"
                  className="flex-1 bg-surface text-blue-900 hover:bg-surface-raised font-bold border-none"
                  disabled={!collectorName || !collectorRelationship || !signatureData}
                  onClick={handleConfirmCheckout}
                >
                  Confirm Checkout & Depart
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="flex-1 bg-transparent hover:bg-surface/10 text-white font-bold border border-white/40"
                  onClick={() => {
                    setCheckoutTargetReg(null);
                    setScannerActive(true);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
