"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Fab } from "@/components/ui/Fab";
import { useToast } from "@/components/ui/Toast";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { AuditTimeline } from "@/components/staff/shared/AuditTimeline";
import { CameraScanner } from "./CameraScanner";
import { SuccessOverlay, ErrorOverlay, MedicalOverlay } from "./OperationalFeedback";
import { QrCodeIcon, MagnifyingGlassIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

type ExtendedUser = { id: string; role: string; organizationId?: string };

interface RecentScan {
  registrationId: string;
  name: string;
  registrationNumber: string;
  timestamp: number;
}

export function CheckInShell({ organizationId, title = "Check-in" }: { organizationId: string; title?: string }) {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const currentUserRole = (session?.user as ExtendedUser)?.role || "";
  const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUserRole);
  const isCampusRep = currentUserRole === "CAMPUS_REPRESENTATIVE";
  const isTeacher = currentUserRole === "TEACHER";
  const isVolunteer = currentUserRole === "VOLUNTEER";

  const searchInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const isMobile = useIsMobile();
  const autoLaunchedRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<{ qrToken?: string; query?: string } | null>(null);
  const [scannerActive, setScannerActive] = useState(false);

  // Overlays State
  const [successData, setSuccessData] = useState<any>(null);
  const [errorData, setErrorData] = useState<string | null>(null);
  const [medicalData, setMedicalData] = useState<any>(null);

  // Recent scans for undo capability (stored locally in state)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [timeTick, setTimeTick] = useState(Date.now());

  // Dialog Timeline State
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);

  // Queries & Mutations
  const { data: stats, refetch: refetchStats } = api.registration.getCheckInStats.useQuery(
    { organizationId },
    { enabled: !!organizationId && (isOrgAdmin || isCampusRep) }
  );

  const { data: results, refetch: refetchResults } = api.registration.lookupForCheckIn.useQuery(
    { organizationId, ...(activeQuery ?? {}) },
    { enabled: !!organizationId && !!activeQuery && !isVolunteer }
  );

  const { data: volunteerResults, refetch: refetchVolunteerResults } = api.staff.lookupCamper.useQuery(
    { organizationId, ...(activeQuery ?? {}) },
    { enabled: !!organizationId && !!activeQuery && isVolunteer }
  );

  const { data: timeline } = api.registration.timeline.useQuery(
    { registrationId: selectedRegistrationId ?? "" },
    { enabled: !!selectedRegistrationId }
  );

  const utils = api.useUtils();

  const checkIn = api.registration.checkIn.useMutation({
    onSuccess: (data: any) => {
      refetchStats?.();
      utils.registration.lookupForCheckIn.invalidate();
      refetchResults?.();
      refetchVolunteerResults?.();
      
      // Add to recent scans list
      const name = data.camper?.name || "Camper";
      const regNo = data.registrationNumber || "REG-NUM";
      
      setRecentScans((prev) => [
        {
          registrationId: data.id,
          name,
          registrationNumber: regNo,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 9), // Keep last 10
      ]);

      // Show large green success feedback card
      setSuccessData({
        camperName: name,
        regNumber: regNo,
        tribe: data.tribe?.name,
        room: data.room?.name,
        bed: data.bed?.label,
        hostel: data.room?.hostel?.name || data.room?.hostelName,
        teacherName: data.teacher?.name,
      });
    },
    onError: (err) => {
      setErrorData(err.message);
    },
  });

  const checkOut = api.registration.checkOut.useMutation({
    onSuccess: () => {
      refetchStats?.();
      refetchResults?.();
      refetchVolunteerResults?.();
      toast.success("Camper checked out");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to check out camper");
    },
  });

  const undoCheckInMutation = api.registration.undoCheckIn.useMutation({
    onSuccess: (_, variables) => {
      refetchStats?.();
      refetchResults?.();
      refetchVolunteerResults?.();
      setRecentScans((prev) => prev.filter((s) => s.registrationId !== variables.registrationId));
      toast.success("Check-in undone");
    },
    onError: (err) => {
      toast.error(`Failed to undo check-in: ${err.message}`);
    },
  });

  // Clock tick to update the Undo button availability timer (30 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus search input on "/"
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Toggle scanner on "Space" (if not inside an input field)
      if (e.key === " " && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setScannerActive((prev) => !prev);
      }
      // Close active overlay on "Escape"
      if (e.key === "Escape") {
        setSuccessData(null);
        setErrorData(null);
        setMedicalData(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-focused search input on mount — desktop only. On mobile this would
  // pop the on-screen keyboard immediately, fighting with the camera-launch
  // effect below and obscuring the page before the user's asked for either.
  useEffect(() => {
    if (!isMobile) searchInputRef.current?.focus();
  }, [isMobile]);

  // Scanning is the primary mobile action (walking around camp, checking
  // campers in one after another) — launch the camera immediately instead of
  // waiting for a tap, but only once per visit so closing it manually sticks.
  useEffect(() => {
    if (isMobile && !autoLaunchedRef.current) {
      autoLaunchedRef.current = true;
      setScannerActive(true);
    }
  }, [isMobile]);

  // Process QR Scanning Decode Success
  const handleScanSuccess = async (qrToken: string) => {
    setScannerActive(false); // Close camera temporarily during validation
    
    // Look up camper details
    try {
      if (isVolunteer) {
        const lookupResult = await utils.client.staff.lookupCamper.query({
          organizationId,
          qrToken,
        });
        if (lookupResult && lookupResult.length > 0) {
          const camper = lookupResult[0];
          
          if (camper.status !== "APPROVED") {
            setErrorData(`Registration status is ${camper.status}. Only approved campers can be checked in.`);
            return;
          }
          
          if (camper.checkedInAt) {
            setErrorData(`${camper.name} is already checked in today.`);
            return;
          }

          // Medical check
          if (camper.allergies || camper.medicalConditions) {
            setMedicalData({
              registrationId: camper.registrationId,
              camperName: camper.name,
              allergies: camper.allergies,
              medicalConditions: camper.medicalConditions,
              dietaryRestrictions: camper.dietaryRestrictions,
            });
            return;
          }

          // Auto Check-in
          checkIn.mutate({ registrationId: camper.registrationId });
        } else {
          setErrorData("QR Code not recognized. Please scan a valid camper QR code.");
        }
      } else {
        const lookupResult = await utils.client.registration.lookupForCheckIn.query({
          organizationId,
          qrToken,
        });
        if (lookupResult && lookupResult.length > 0) {
          const camper = lookupResult[0];
          
          if (camper.status !== "APPROVED") {
            setErrorData(`Registration status is ${camper.status}. Only approved campers can be checked in.`);
            return;
          }
          
          if (camper.status === "CHECKED_IN") {
            setErrorData(`${camper.camper?.name} is already checked in.`);
            return;
          }

          // Medical check
          if (camper.camper?.allergies || camper.camper?.medicalConditions) {
            setMedicalData({
              registrationId: camper.id,
              camperName: camper.camper?.name,
              allergies: camper.camper?.allergies,
              medicalConditions: camper.camper?.medicalConditions,
              dietaryRestrictions: camper.camper?.dietaryRestrictions,
              emergencyContactName: camper.camper?.emergencyContactName,
              emergencyContactPhone: camper.camper?.emergencyContactPhone,
              relationship: camper.camper?.relationship,
              parentPhone: camper.camper?.parentPhone,
              teenPhone: camper.camper?.teenPhone,
            });
            return;
          }

          // Auto Check-in
          checkIn.mutate({ registrationId: camper.id });
        } else {
          setErrorData("QR Code not recognized. Please scan a valid camper QR code.");
        }
      }
    } catch (err: any) {
      setErrorData(err.message || "Failed to parse camper QR code.");
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setActiveQuery({ query: searchQuery.trim() });
  };

  const clearQuery = () => {
    setSearchQuery("");
    setActiveQuery(null);
  };

  const handleManualCheckIn = (registrationId: string, hasMedical: boolean, camperObj: any) => {
    if (hasMedical) {
      setMedicalData({
        registrationId,
        camperName: camperObj.name || camperObj.camper?.name,
        allergies: camperObj.allergies || camperObj.camper?.allergies,
        medicalConditions: camperObj.medicalConditions || camperObj.camper?.medicalConditions,
        dietaryRestrictions: camperObj.dietaryRestrictions || camperObj.camper?.dietaryRestrictions,
        emergencyContactName: camperObj.emergencyContactName || camperObj.camper?.emergencyContactName,
        emergencyContactPhone: camperObj.emergencyContactPhone || camperObj.camper?.emergencyContactPhone,
        relationship: camperObj.relationship || camperObj.camper?.relationship,
        parentPhone: camperObj.parentPhone || camperObj.camper?.parentPhone,
        teenPhone: camperObj.teenPhone || camperObj.camper?.teenPhone,
      });
    } else {
      checkIn.mutate({ registrationId });
    }
  };

  const currentResults = isVolunteer ? volunteerResults : results;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={title} />
        {isOrgAdmin && (
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowPathIcon className="h-4 w-4" />}
            onClick={() => refetchStats?.()}
          >
            Refresh Stats
          </Button>
        )}
      </div>

      {/* ═══ STEP 1: DASHBOARD PROGRESS WIDGET (HIDES FOR VOLUNTEER) ═══ */}
      {!isVolunteer && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-white border-neutral-200">
            <CardBody className="p-4 text-center">
              <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-400">Approved</span>
              <span className="text-2xl font-black text-neutral-900">{stats.approved}</span>
            </CardBody>
          </Card>
          <Card className="bg-white border-neutral-200">
            <CardBody className="p-4 text-center">
              <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-400">Checked In</span>
              <span className="text-2xl font-black text-emerald-600">{stats.checkedIn}</span>
            </CardBody>
          </Card>
          <Card className="bg-white border-neutral-200">
            <CardBody className="p-4 text-center">
              <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-400">Remaining</span>
              <span className="text-2xl font-black text-neutral-900">{stats.remaining}</span>
            </CardBody>
          </Card>
          <Card className="bg-white border-neutral-200">
            <CardBody className="p-4 text-center">
              <span className="block text-xs font-semibold uppercase tracking-wider text-neutral-400">Progress</span>
              <span className="text-2xl font-black text-accent-600">{stats.percentage}%</span>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ═══ STEP 2: SCANNER & WEBCAM INTERFACE ═══ */}
      <Card className="overflow-hidden border-neutral-200">
        <CardBody className="p-6 text-center space-y-4">
          <div className="max-w-md mx-auto">
            <Button
              size="lg"
              className="w-full flex items-center justify-center gap-2 h-14 text-lg font-bold shadow-md bg-accent-600 hover:bg-accent-700 text-white"
              onClick={() => setScannerActive((prev) => !prev)}
            >
              <QrCodeIcon className="h-6 w-6" />
              {scannerActive ? "Close Camera Scanner" : "Scan Camper QR Code"}
            </Button>
            <p className="mt-1.5 text-xs text-neutral-400">Press [Space] on your keyboard to toggle camera scanner</p>
          </div>

          {scannerActive && (
            <div className="pt-2 animate-fade-in">
              <CameraScanner
                active={scannerActive}
                onScanSuccess={handleScanSuccess}
                onScanFailure={(err) => console.log("Scanner idle / error:", err)}
              />
            </div>
          )}
        </CardBody>
      </Card>

      {/* ═══ STEP 3: UNIVERSAL MANUAL SEARCH ═══ */}
      <Card className="border-neutral-200">
        <CardBody className="p-6">
          <form onSubmit={handleSearchSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-neutral-400" />
              <Input
                ref={searchInputRef}
                containerClassName="w-full"
                className="pl-10 h-11 text-sm rounded-lg"
                placeholder={isVolunteer ? "Registration #, camper name" : "Registration #, camper name, email, or phone"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="absolute right-3 top-3.5 text-xs text-neutral-400 pointer-events-none hidden md:inline">
                Press [/] to focus
              </span>
            </div>
            <Button type="submit" size="lg" className="h-11">Search</Button>
            {activeQuery && (
              <Button type="button" size="lg" variant="secondary" onClick={clearQuery}>Clear</Button>
            )}
          </form>
        </CardBody>
      </Card>

      {/* ═══ STEP 4: SEARCH RESULTS WORKSPACE ═══ */}
      {activeQuery && (currentResults ?? []).length === 0 && (
        <div className="rounded-xl bg-warning-50 p-4 border border-warning-100 text-sm text-warning-700 flex justify-between items-center animate-fade-in">
          <span>No matching camper found. Please check spelling or verify registration number.</span>
          <button onClick={clearQuery} className="text-xs font-bold underline hover:no-underline">Dismiss</button>
        </div>
      )}

      {(currentResults ?? []).map((r: any) => {
        // Normalize fields for volunteer vs admin/teacher
        const regId = r.registrationId || r.id;
        const regNo = r.registrationNumber;
        const camperName = r.name || r.camper?.name;
        const photo = r.photoUrl || r.camper?.photoUrl;
        const gender = r.gender || r.camper?.gender;
        const dob = r.dateOfBirth || r.camper?.dateOfBirth;
        
        const isCheckedIn = !!r.checkedInAt;
        const isApproved = r.status === "APPROVED";
        const hasMedical = !!(r.allergies || r.medicalConditions || r.camper?.allergies || r.camper?.medicalConditions);
        
        return (
          <Card key={regId} className="border-neutral-200 hover:shadow-md transition-shadow animate-fade-in">
            <CardBody className="p-6 space-y-4">
              <div className="flex items-start gap-4">
                {photo ? (
                  <img src={photo} alt={camperName} className="h-16 w-16 rounded-xl object-cover border border-neutral-200 shadow-sm" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-accent-50 border border-accent-100 text-accent-700 font-bold flex items-center justify-center text-xl shadow-sm">
                    {camperName?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-neutral-900 truncate">{camperName}</h2>
                    <Badge tone={isCheckedIn ? "info" : isApproved ? "success" : "neutral"}>
                      {isCheckedIn ? "Already Checked In" : isApproved ? "Ready for Check-in" : r.status}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">{regNo}</p>
                  {isCheckedIn && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Checked in: {r.checkedInByName || "Staff"}
                    </p>
                  )}
                </div>
              </div>

              {/* Medical Block */}
              {hasMedical && (
                <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-danger-800 space-y-2">
                  <span className="block text-xs font-black uppercase tracking-wider text-danger-600">⚠ Medical Alert</span>
                  <div className="flex flex-wrap gap-2">
                    {(r.allergies || r.camper?.allergies) && (
                      <Badge tone="danger">Allergies: {r.allergies || r.camper?.allergies}</Badge>
                    )}
                    {(r.medicalConditions || r.camper?.medicalConditions) && (
                      <Badge tone="danger">Conditions: {r.medicalConditions || r.camper?.medicalConditions}</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic details for non-volunteers */}
              {!isVolunteer && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm border-t border-neutral-100 pt-3">
                  <div>
                    <span className="block text-xs text-neutral-400 uppercase font-semibold">Camp</span>
                    <span className="font-semibold text-neutral-800">{r.camp?.name || r.year?.name || "—"}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-neutral-400 uppercase font-semibold">Campus</span>
                    <span className="font-semibold text-neutral-800">{r.campus?.name || r.centreName || "—"}</span>
                  </div>
                  {r.tribe && (
                    <div>
                      <span className="block text-xs text-neutral-400 uppercase font-semibold">Tribe</span>
                      <span className="font-semibold text-neutral-800">{r.tribe?.name || "—"}</span>
                    </div>
                  )}
                  {r.room && (
                    <div>
                      <span className="block text-xs text-neutral-400 uppercase font-semibold">Room & Bed</span>
                      <span className="font-semibold text-neutral-800">{r.room?.name} / {r.bed?.label || "—"}</span>
                    </div>
                  )}
                  {gender && (
                    <div>
                      <span className="block text-xs text-neutral-400 uppercase font-semibold">Gender</span>
                      <span className="font-semibold text-neutral-800">{gender}</span>
                    </div>
                  )}
                  {dob && (
                    <div>
                      <span className="block text-xs text-neutral-400 uppercase font-semibold">DOB</span>
                      <span className="font-semibold text-neutral-800">{new Date(dob).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                {!isCheckedIn && isApproved && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 px-6 rounded-md"
                    loading={checkIn.isPending}
                    onClick={() => handleManualCheckIn(regId, hasMedical, r)}
                  >
                    Check In
                  </Button>
                )}
                {isCheckedIn && (
                  <Button
                    variant="secondary"
                    className="h-10 px-6 rounded-md"
                    loading={checkOut.isPending}
                    onClick={() => checkOut.mutate({ registrationId: regId })}
                  >
                    Check Out
                  </Button>
                )}
                {!isVolunteer && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-10 px-6 rounded-md"
                    onClick={() => setSelectedRegistrationId(regId)}
                  >
                    View Timeline
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}

      {/* ═══ STEP 5: RECENT ACTIVITY & UNDO LIST ═══ */}
      {recentScans.length > 0 && (
        <Card className="border-neutral-200">
          <CardBody className="p-6 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-neutral-400">Recent Activity</h2>
            <div className="divide-y divide-neutral-100">
              {recentScans.map((scan) => {
                const elapsedSeconds = Math.floor((timeTick - scan.timestamp) / 1000);
                const isUndoable = elapsedSeconds < 30;
                const remainingSeconds = 30 - elapsedSeconds;

                return (
                  <div key={scan.registrationId} className="py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-bold text-neutral-900 block">{scan.name}</span>
                      <span className="text-xs text-neutral-500">{scan.registrationNumber} · Checked In at {new Date(scan.timestamp).toLocaleTimeString()}</span>
                    </div>
                    {isUndoable && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-neutral-100 hover:bg-rose-50 text-rose-600 hover:text-rose-700 border-none font-bold"
                        loading={undoCheckInMutation.isPending}
                        onClick={() => undoCheckInMutation.mutate({ registrationId: scan.registrationId, reason: "Accidental scan / Operator error" })}
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

      {/* ═══ STEP 6: OPERATIONAL FEEDBACK FULLSCREEN OVERLAYS ═══ */}
      {successData && (
        <SuccessOverlay
          camperName={successData.camperName}
          regNumber={successData.regNumber}
          tribe={successData.tribe}
          room={successData.room}
          bed={successData.bed}
          hostel={successData.hostel}
          teacherName={successData.teacherName}
          onDismiss={() => {
            setSuccessData(null);
            // Re-open camera after brief overlay if scanner was active
            setScannerActive(true);
          }}
        />
      )}

      {errorData && (
        <ErrorOverlay
          message={errorData}
          onDismiss={() => {
            setErrorData(null);
            setScannerActive(true);
          }}
        />
      )}

      {medicalData && (
        <MedicalOverlay
          camperName={medicalData.camperName}
          allergies={medicalData.allergies}
          medicalConditions={medicalData.medicalConditions}
          medications={medicalData.medications}
          dietaryRestrictions={medicalData.dietaryRestrictions}
          emergencyContactName={medicalData.emergencyContactName}
          emergencyContactPhone={medicalData.emergencyContactPhone}
          relationship={medicalData.relationship}
          parentPhone={medicalData.parentPhone}
          teenPhone={medicalData.teenPhone}
          onAcknowledge={() => {
            setMedicalData(null);
            checkIn.mutate({ registrationId: medicalData.registrationId });
          }}
          onCancel={() => {
            setMedicalData(null);
            setScannerActive(true);
          }}
        />
      )}

      <Dialog open={!!selectedRegistrationId} onClose={() => setSelectedRegistrationId(null)} title="Registration Timeline">
        <AuditTimeline events={timeline ?? []} />
      </Dialog>

      {/* Re-open scanning without scrolling back up — hidden while the
          camera itself is open (the big "Close Camera Scanner" button above
          already covers that) or an overlay is covering the screen. */}
      {!scannerActive && !successData && !errorData && !medicalData && (
        <Fab icon={<QrCodeIcon className="h-6 w-6" />} label="Scan camper QR code" onClick={() => setScannerActive(true)} />
      )}
    </div>
  );
}
