"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Fab } from "@/components/ui/Fab";
import { useToast } from "@/components/ui/Toast";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { CameraScanner } from "./CameraScanner";
import { CheckoutSignaturePad } from "./CheckoutSignaturePad";
import { useOfflineScanner } from "@/hooks/useOfflineScanner";
import {
  QrCodeIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CpuChipIcon,
  MapPinIcon,
  UserIcon,
  HeartIcon,
  CakeIcon,
  ArrowLeftOnRectangleIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ChevronRightIcon,
  BookOpenIcon,
  IdentificationIcon,
} from "@heroicons/react/24/outline";

type ExtendedUser = { id: string; role: string; organizationId?: string };

interface RecentScan {
  registrationId: string;
  name: string;
  registrationNumber: string;
  station: string;
  timestamp: number;
}

const STATION_PRESETS = [
  { id: "CAMP_ARRIVAL", name: "Camp Arrival", icon: MapPinIcon, color: "bg-emerald-500" },
  { id: "PICKUP_POINT", name: "Pickup Point Check-in", icon: MapPinIcon, color: "bg-teal-500", customSubName: true },
  { id: "HOSTEL_ARRIVAL", name: "Hostel Arrival", icon: MapPinIcon, color: "bg-indigo-500" },
  { id: "BREAKFAST", name: "Breakfast Station", icon: CakeIcon, color: "bg-amber-500" },
  { id: "LUNCH", name: "Lunch Station", icon: CakeIcon, color: "bg-orange-500" },
  { id: "DINNER", name: "Dinner Station", icon: CakeIcon, color: "bg-rose-500" },
  { id: "CHECKOUT", name: "Checkout Desk", icon: ArrowLeftOnRectangleIcon, color: "bg-blue-500" },
  { id: "IDENTITY_LOOKUP", name: "Identity Lookup", icon: IdentificationIcon, color: "bg-purple-500" },
  { id: "EMERGENCY_LOOKUP", name: "Emergency Lookup", icon: HeartIcon, color: "bg-red-500" },
] as const;

export function ScanCenterShell({
  organizationId,
  defaultStationId,
}: {
  organizationId: string;
  defaultStationId?: string;
}) {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const currentUserRole = (session?.user as ExtendedUser)?.role || "";
  const isVolunteer = currentUserRole === "VOLUNTEER";

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const isMobile = useIsMobile();

  // Active Station Configuration State
  const [activeStation, setActiveStation] = useState<string | null>(null);
  const [stationLocation, setStationLocation] = useState("");
  const [deviceIdentifier, setDeviceIdentifier] = useState("");
  const [customStationName, setCustomStationName] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [lastCacheSyncTime, setLastCacheSyncTime] = useState<string>("Never");
  const [skipMedicalAlerts, setSkipMedicalAlerts] = useState(false);

  // Hook for Offline capabilities
  const offlineScanner = useOfflineScanner(organizationId);
  const utils = api.useUtils();

  // Overlays & Dialogs State
  const [successData, setSuccessData] = useState<any>(null);
  const [duplicateData, setDuplicateData] = useState<any>(null);
  const [medicalData, setMedicalData] = useState<any>(null);
  const [lookupData, setLookupData] = useState<any>(null);
  const [emergencyLookupData, setEmergencyLookupData] = useState<any>(null);

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

  // Stats query
  const { data: operationalStats, refetch: refetchStats } = api.scan.getOperationalStats.useQuery(
    { organizationId },
    { enabled: !!organizationId && activeStation === null }
  );

  const undoCheckInMutation = api.registration.undoCheckIn.useMutation({
    onSuccess: (_, variables) => {
      setRecentScans((prev) => prev.filter((s) => s.registrationId !== variables.registrationId));
      toast.success("Check-in undone successfully");
      refetchStats?.();
    },
    onError: (err) => {
      toast.error(`Failed to undo check-in: ${err.message}`);
    },
  });

  // Load defaults from localStorage if available
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedStation = localStorage.getItem("camply-scan-station");
    const savedLocation = localStorage.getItem("camply-scan-location");
    const savedDevice = localStorage.getItem("camply-scan-device");
    const savedCustom = localStorage.getItem("camply-scan-custom-name");
    const savedSync = localStorage.getItem("camply-scan-last-sync");

    if (defaultStationId) {
      const preset = STATION_PRESETS.find((p) => p.id === defaultStationId);
      if (preset) {
        setActiveStation(preset.id);
        if (preset.id === "PICKUP_POINT" && savedCustom) setCustomStationName(savedCustom);
      }
    } else if (savedStation) {
      setActiveStation(savedStation);
      if (savedCustom) setCustomStationName(savedCustom);
    }

    if (savedLocation) setStationLocation(savedLocation);
    if (savedDevice) setDeviceIdentifier(savedDevice);
    if (savedSync) setLastCacheSyncTime(savedSync);

    const savedSkipMedical = localStorage.getItem("camply-scan-skip-medical");
    if (savedSkipMedical) setSkipMedicalAlerts(savedSkipMedical === "true");
  }, [defaultStationId]);

  // Keep timers running to refresh "Undo" buttons
  useEffect(() => {
    const timer = setInterval(() => setTimeTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut: slash key focuses search, Escape closes overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSuccessData(null);
        setDuplicateData(null);
        setMedicalData(null);
        setLookupData(null);
        setEmergencyLookupData(null);
        setCheckoutTargetReg(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Format active station text
  const getStationLabel = () => {
    if (!activeStation) return "Scan Center";
    if (activeStation === "PICKUP_POINT") return customStationName || "Pickup Point";
    if (activeStation === "CUSTOM") return customStationName || "Custom Station";
    const preset = STATION_PRESETS.find((p) => p.id === activeStation);
    return preset ? preset.name : "Scanner";
  };

  const handleStationSelect = (stationId: string) => {
    setActiveStation(stationId);
    localStorage.setItem("camply-scan-station", stationId);
    if (stationId === "PICKUP_POINT" && !customStationName) {
      setCustomStationName("Lekki Pickup Point");
      localStorage.setItem("camply-scan-custom-name", "Lekki Pickup Point");
    }
    // Launch scanner on station activation on mobile
    if (isMobile) {
      setScannerActive(true);
    }
  };

  const handleChangeStation = () => {
    setActiveStation(null);
    setScannerActive(false);
    localStorage.removeItem("camply-scan-station");
  };

  const handleCustomStationSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStationName.trim()) {
      localStorage.setItem("camply-scan-custom-name", customStationName.trim());
    }
  };

  const handleLocationChange = (val: string) => {
    setStationLocation(val);
    localStorage.setItem("camply-scan-location", val);
  };

  const handleDeviceChange = (val: string) => {
    setDeviceIdentifier(val);
    localStorage.setItem("camply-scan-device", val);
  };

  const handleSkipMedicalChange = (val: boolean) => {
    setSkipMedicalAlerts(val);
    localStorage.setItem("camply-scan-skip-medical", String(val));
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

  // Perform the core scan operation
  const handleScanSubmit = async (payload: { qrToken?: string; query?: string; acknowledgedMedical?: boolean; checkoutDetails?: any }) => {
    if (!activeStation) return;
    setScannerActive(false); // pause scanner while processing

    const targetStationName = getStationLabel();

    try {
      const response = await offlineScanner.executeScan({
        qrToken: payload.qrToken,
        query: payload.query,
        station: targetStationName,
        device: deviceIdentifier || undefined,
        location: stationLocation || undefined,
        acknowledgedMedical: payload.acknowledgedMedical,
        skipMedicalAlerts,
        checkoutDetails: payload.checkoutDetails,
      });

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
 
      // B. REQUIRES MEDICAL ACKNOWLEDGEMENT (SERVER INTERCEPT)
      if (response.result === "REQUIRES_MEDICAL_ACKNOWLEDGEMENT") {
        setMedicalData({
          registration: response.registration,
          qrToken: payload.qrToken,
          query: payload.query,
        });
        return;
      }

      // C. DUPLICATE SCAN
      if (response.result === "DUPLICATE") {
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

      // Handle Lookup Station Overlay
      if (activeStation === "IDENTITY_LOOKUP") {
        // Fetch scan history for the camper profile lookup
        let history: any[] = [];
        try {
          history = await utils.client.scan.getCamperScanHistory.query({ registrationId: reg.id });
        } catch {}

        setLookupData({
          registration: reg,
          history,
        });
        return;
      }

      if (activeStation === "EMERGENCY_LOOKUP") {
        setEmergencyLookupData(camper);
        return;
      }

      // Pre-check for Medical Alert on regular Check-ins (only if not already acknowledged - client fallback for offline)
      const hasMedical = camper.allergies || camper.medicalConditions || camper.dietaryRestrictions;
      if (!skipMedicalAlerts && activeStation !== "CHECKOUT" && activeStation !== "IDENTITY_LOOKUP" && activeStation !== "EMERGENCY_LOOKUP" && hasMedical && !payload.acknowledgedMedical) {
        setMedicalData({
          registration: reg,
          qrToken: payload.qrToken,
          query: payload.query,
        });
        return;
      }

      // Add to recent activity list
      setRecentScans((prev) => [
        {
          registrationId: reg.id,
          name: camper.name,
          registrationNumber: reg.registrationNumber,
          station: targetStationName,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 9),
      ]);

      // Show large success overlay
      setSuccessData({
        camperName: camper.name,
        photoUrl: camper.photoUrl,
        regNumber: reg.registrationNumber,
        actionPerformed: response.actionPerformed || "Checked In",
        tribe: reg.tribe?.name,
        hostel: reg.room?.hostel?.name || reg.room?.hostelName,
        room: reg.room?.name,
        bed: reg.bed?.label,
        teacherName: reg.teacher?.name,
      });

    } catch (err: any) {
      toast.error(err.message || "Failed to process scan.");
      setScannerActive(true);
    }
  };

  const handleScanSuccess = (decodedText: string) => {
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      
      {/* ═══ TOP STATUS HEADERS ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <PageHeader title={getStationLabel()} />
        </div>
        
        {/* Offline & Cache Indicators */}
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={offlineScanner.isOnline ? "success" : "warning"}>
            <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
            {offlineScanner.isOnline ? "Online" : "Offline Mode"}
          </Badge>
          
          {offlineScanner.offlineQueueCount > 0 && (
            <Badge tone="info" className="animate-pulse">
              {offlineScanner.offlineQueueCount} unsynced scans
            </Badge>
          )}

          {!offlineScanner.isOnline && offlineScanner.offlineQueueCount > 0 && (
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowPathIcon className="h-3 w-3" />}
              loading={offlineScanner.isSyncing}
              onClick={() => offlineScanner.syncOfflineQueue()}
            >
              Sync Queue
            </Button>
          )}

          <Button
            size="sm"
            variant="secondary"
            icon={<CpuChipIcon className="h-3 w-3" />}
            loading={isRefreshingCache}
            onClick={handleOfflineCacheRefresh}
          >
            Cache offline ({lastCacheSyncTime})
          </Button>
        </div>
      </div>

      {/* ═══ VIEW 1: STATION SELECTOR ═══ */}
      {activeStation === null && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Operations Live Metrics Widget */}
          {operationalStats && !isVolunteer && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-surface border-border-default">
                <CardBody className="p-4 text-center">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-txt-muted">Total Registered</span>
                  <span className="text-2xl font-black text-neutral-900">{operationalStats.registered}</span>
                </CardBody>
              </Card>
              <Card className="bg-surface border-border-default">
                <CardBody className="p-4 text-center">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-txt-muted">In Camp (Arrived)</span>
                  <span className="text-2xl font-black text-emerald-600">{operationalStats.checkedIn}</span>
                </CardBody>
              </Card>
              <Card className="bg-surface border-border-default">
                <CardBody className="p-4 text-center">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-txt-muted">Pending Arrival</span>
                  <span className="text-2xl font-black text-neutral-500">{operationalStats.pendingArrival}</span>
                </CardBody>
              </Card>
              <Card className="bg-surface border-border-default">
                <CardBody className="p-4 text-center">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-txt-muted">Departed (Checked-out)</span>
                  <span className="text-2xl font-black text-blue-600">{operationalStats.checkedOutCount}</span>
                </CardBody>
              </Card>
            </div>
          )}

          {/* Meals Stats Summary */}
          {operationalStats && !isVolunteer && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 text-center">
                <span className="block text-[10px] uppercase font-bold text-amber-600">Breakfast Served</span>
                <span className="text-lg font-black text-amber-800">{operationalStats.breakfastCount}</span>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 border border-orange-100 text-center">
                <span className="block text-[10px] uppercase font-bold text-orange-600">Lunch Served</span>
                <span className="text-lg font-black text-orange-800">{operationalStats.lunchCount}</span>
              </div>
              <div className="bg-rose-50 rounded-xl p-3 border border-rose-100 text-center">
                <span className="block text-[10px] uppercase font-bold text-rose-600">Dinner Served</span>
                <span className="text-lg font-black text-rose-800">{operationalStats.dinnerCount}</span>
              </div>
            </div>
          )}

          {/* Configuration Form */}
          <Card className="border-border-default bg-neutral-50/50">
            <CardBody className="p-6 space-y-4">
              <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider">Device & Desk Config</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Station Location / Gate"
                  placeholder="e.g. Lekki Bus, Gate A, Desk 3"
                  value={stationLocation}
                  onChange={(e) => handleLocationChange(e.target.value)}
                />
                <Input
                  label="Device Identifier"
                  placeholder="e.g. Volunteer iPhone 14, Kitchen iPad 1"
                  value={deviceIdentifier}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3 bg-surface p-3 rounded-lg border border-border-default shadow-sm mt-2">
                <input
                  type="checkbox"
                  id="skipMedicalAlerts"
                  checked={skipMedicalAlerts}
                  onChange={(e) => handleSkipMedicalChange(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                />
                <div className="leading-tight">
                  <label htmlFor="skipMedicalAlerts" className="text-sm font-bold text-neutral-700 select-none cursor-pointer block">
                    Disable Medical Alerts Warning Screen
                  </label>
                  <span className="text-xs text-txt-muted">Ignore warnings and automatically proceed with scans.</span>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Station Preset Grid */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider">Select Active Station</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {STATION_PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleStationSelect(preset.id)}
                    className="flex items-center gap-4 p-4 bg-surface border border-border-default hover:border-accent-500 hover:shadow-md rounded-xl transition text-left group"
                  >
                    <div className={`p-3 rounded-lg text-white ${preset.color} transition-transform group-hover:scale-105`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block font-bold text-neutral-900 truncate">{preset.name}</span>
                      <span className="block text-xs text-txt-muted">Tap to start scans</span>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 text-neutral-300 group-hover:text-accent-500 transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Station Configuration Option */}
          <Card className="border-border-default">
            <CardBody className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                <BookOpenIcon className="h-6 w-6 text-txt-muted" />
                <div>
                  <span className="block font-bold text-neutral-900">Custom Attendance / Event Checkpoint</span>
                  <span className="block text-xs text-txt-muted">e.g. Bible Study, Swimming, Bus Boarding</span>
                </div>
              </div>
              <form onSubmit={handleCustomStationSave} className="flex gap-2 w-full sm:w-auto">
                <Input
                  placeholder="Enter checkpoint name..."
                  value={customStationName}
                  onChange={(e) => setCustomStationName(e.target.value)}
                  containerClassName="flex-1 sm:w-60"
                  className="h-10"
                />
                <Button type="button" onClick={() => handleStationSelect("CUSTOM")}>
                  Select
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ═══ VIEW 2: ACTIVE SCANNING PLATFORM ═══ */}
      {activeStation !== null && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Station Panel Header */}
          <div className="flex items-center justify-between p-4 bg-neutral-900 text-white rounded-xl shadow-md border border-neutral-800">
            <div className="flex items-center gap-3">
              <span className="h-3.5 w-3.5 rounded-full bg-accent-500 animate-pulse" />
              <div>
                <span className="block font-black text-lg">{getStationLabel()}</span>
                {stationLocation && (
                  <span className="block text-xs text-txt-muted">Location: {stationLocation}</span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="bg-surface/10 hover:bg-surface/20 text-white border-none font-bold"
              onClick={handleChangeStation}
            >
              Change Station
            </Button>
          </div>

          {/* Scanner Card Viewport */}
          <Card className="overflow-hidden border-border-default">
            <CardBody className="p-6 text-center space-y-4">
              <div className="max-w-md mx-auto">
                <Button
                  size="lg"
                  className="w-full flex items-center justify-center gap-2 h-14 text-lg font-bold shadow-md bg-accent-600 hover:bg-accent-700 text-white border-none"
                  onClick={() => setScannerActive((prev) => !prev)}
                >
                  <QrCodeIcon className="h-6 w-6" />
                  {scannerActive ? "Close Camera Scanner" : "Launch Camera Scanner"}
                </Button>
                <p className="mt-1.5 text-xs text-txt-muted">Allows instant hands-free camper lookup/check-in</p>
              </div>

              {scannerActive && (
                <div className="pt-2">
                  <CameraScanner
                    active={scannerActive}
                    onScanSuccess={handleScanSuccess}
                    onScanFailure={(err) => console.log("Scanner loop:", err)}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Fallback Manual Query Search */}
          <Card className="border-border-default">
            <CardBody className="p-4">
              <form onSubmit={handleSearchSubmit} className="flex gap-3">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-txt-muted" />
                  <Input
                    ref={searchInputRef}
                    containerClassName="w-full"
                    className="pl-10 h-10 text-sm rounded-lg"
                    placeholder="Enter Registration #, camper name, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-txt-muted pointer-events-none hidden md:inline">
                    Press [/] to search
                  </span>
                </div>
                <Button type="submit" className="h-10">Search</Button>
              </form>
            </CardBody>
          </Card>

          {/* Recent Scans Activity Logs & Quick Undo Timer (30s) */}
          {recentScans.length > 0 && (
            <Card className="border-border-default">
              <CardBody className="p-6 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-txt-muted">
                  Recent Station Activity
                </h3>
                <div className="divide-y divide-neutral-100">
                  {recentScans.map((scan) => {
                    const elapsedSeconds = Math.floor((timeTick - scan.timestamp) / 1000);
                    const isUndoable = elapsedSeconds < 30 && activeStation !== "CHECKOUT" && !activeStation.includes("LOOKUP");
                    const remainingSeconds = 30 - elapsedSeconds;

                    return (
                      <div key={scan.registrationId} className="py-3 flex items-center justify-between text-sm">
                        <div>
                          <span className="font-bold text-neutral-900 block">{scan.name}</span>
                          <span className="text-xs text-neutral-500">
                            {scan.registrationNumber} · {scan.station} at{" "}
                            {new Date(scan.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        {isUndoable && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold border-none"
                            loading={undoCheckInMutation.isPending}
                            onClick={() =>
                              undoCheckInMutation.mutate({
                                registrationId: scan.registrationId,
                                reason: "Volunteer operator error / duplicate sync correction",
                              })
                            }
                          >
                            Undo ({remainingSeconds}s)
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* ═══ OVERLAY 1: SUCCESS FEEDBACK OVERLAY ═══ */}
      {successData && (
        <div
          onClick={() => {
            setSuccessData(null);
            setScannerActive(true);
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-600 p-6 text-white cursor-pointer animate-fade-in"
        >
          <div className="flex flex-col items-center max-w-lg text-center space-y-6">
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
                className="h-32 w-32 rounded-2xl object-cover border-4 border-white/20 shadow-xl"
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

            <p className="text-xs opacity-60">Tapping anywhere will skip and return to scanning</p>
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-blue-600 p-6 text-white cursor-pointer animate-fade-in"
        >
          <div className="flex flex-col items-center max-w-lg text-center space-y-6">
            <InformationCircleIcon className="h-24 w-24 md:h-32 md:w-32 animate-pulse" />
            
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-black tracking-tight">Already Recorded</h1>
              <p className="text-2xl md:text-3xl font-bold opacity-90">{duplicateData.camperName}</p>
              <p className="text-sm font-semibold tracking-wider opacity-75 uppercase">{duplicateData.regNumber}</p>
            </div>

            {duplicateData.photoUrl && (
              <img
                src={duplicateData.photoUrl}
                alt={duplicateData.camperName}
                className="h-32 w-32 rounded-2xl object-cover border-4 border-white/20 shadow-xl"
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

            <p className="text-xs opacity-60">Tapping anywhere will return to scanning</p>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-red-700 p-6 text-white cursor-pointer overflow-y-auto"
        >
          <div className="flex flex-col max-w-xl w-full text-center space-y-6 py-6">
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
                  className="h-32 w-32 rounded-2xl object-cover border-4 border-white/20 shadow-xl"
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
      )}

      {/* ═══ OVERLAY 4: CAMPER DETAILS LOOKUP OVERLAY ═══ */}
      {lookupData && (
        <div
          onClick={() => {
            setLookupData(null);
            setScannerActive(true);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-purple-900 p-6 text-white cursor-pointer overflow-y-auto"
        >
          <div className="flex flex-col max-w-xl w-full space-y-6 py-6 text-left">
            <div className="flex items-center gap-4 border-b border-white/10 pb-4">
              {lookupData.registration.camper.photoUrl ? (
                <img
                  src={lookupData.registration.camper.photoUrl}
                  alt={lookupData.registration.camper.name}
                  className="h-20 w-20 rounded-2xl object-cover border-2 border-white/20 shadow-md"
                />
              ) : (
                <div className="h-20 w-20 rounded-2xl bg-surface/15 flex items-center justify-center text-3xl font-black">
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

            <p className="text-xs text-center opacity-40">Tapping anywhere will return to scanning</p>
          </div>
        </div>
      )}

      {/* ═══ OVERLAY 5: MEDICAL PRE-VERIFICATION OVERLAY ═══ */}
      {medicalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-amber-600 p-6 text-white overflow-y-auto">
          <div className="flex flex-col max-w-xl w-full text-center space-y-6 py-6">
            <div className="flex flex-col items-center space-y-3">
              <ExclamationTriangleIcon className="h-20 w-20 text-amber-100 animate-bounce" />
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">⚠ Medical & safety alert</h1>
              <p className="text-xl md:text-2xl font-bold opacity-95">{medicalData.registration.camper.name}</p>
            </div>

            <div className="bg-surface/10 backdrop-blur rounded-xl p-4 text-left space-y-4 border border-white/10 text-sm md:text-base">
              {medicalData.registration.camper.allergies && (
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Allergies</span>
                  <span className="font-bold text-lg text-amber-50">{medicalData.registration.camper.allergies}</span>
                </div>
              )}
              {medicalData.registration.camper.medicalConditions && (
                <div>
                  <span className="block text-xs uppercase opacity-75 font-semibold text-white/80">Medical Conditions</span>
                  <span className="font-bold text-lg text-amber-50">{medicalData.registration.camper.medicalConditions}</span>
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
                className="flex-1 bg-surface text-amber-700 hover:bg-surface-raised font-bold py-4 text-base border-none shadow-lg"
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
      )}

      {/* ═══ OVERLAY 6: SECURE CHECKOUT GUARDIAN FORM OVERLAY ═══ */}
      {checkoutTargetReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900 p-6 text-white overflow-y-auto">
          <div className="flex flex-col max-w-xl w-full space-y-6 py-6 text-left">
            
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
      )}

      {/* Floating Action Button to launch scanner without scrolling */}
      {!scannerActive && activeStation !== null && !successData && !duplicateData && !checkoutTargetReg && !medicalData && !lookupData && !emergencyLookupData && (
        <Fab icon={<QrCodeIcon className="h-6 w-6" />} label="Scan camper" onClick={() => setScannerActive(true)} />
      )}
    </div>
  );
}
