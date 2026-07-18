"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Fab } from "@/components/ui/Fab";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { AuditTimeline } from "@/components/staff/shared/AuditTimeline";
import { CameraScanner } from "./CameraScanner";
import { CheckoutSignaturePad } from "./CheckoutSignaturePad";
import { ErrorOverlay } from "./OperationalFeedback";
import { QrCodeIcon, MagnifyingGlassIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

type ExtendedUser = { id: string; role: string; organizationId?: string };

export function CheckOutShell({ organizationId, title = "Check-out" }: { organizationId: string; title?: string }) {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const currentUserRole = (session?.user as ExtendedUser)?.role || "";
  const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUserRole);
  const isCampusRep = currentUserRole === "CAMPUS_REPRESENTATIVE";
  const isTeacher = currentUserRole === "TEACHER";
  const isVolunteer = currentUserRole === "VOLUNTEER";

  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const autoLaunchedRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<{ qrToken?: string; query?: string } | null>(null);
  const [scannerActive, setScannerActive] = useState(false);

  // Form State
  const [collectorType, setCollectorType] = useState("PARENT");
  const [collectorName, setCollectorName] = useState("");
  const [collectorRelationship, setCollectorRelationship] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [parentPin, setParentPin] = useState("");
  const [activeCamperName, setActiveCamperName] = useState("");

  // Overlays & Dialogs State
  const [checkoutSuccessCamper, setCheckoutSuccessCamper] = useState<string | null>(null);
  const [errorData, setErrorData] = useState<string | null>(null);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);

  // Queries & Mutations
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

  const checkOut = api.registration.checkOut.useMutation({
    onSuccess: () => {
      utils.registration.lookupForCheckIn.invalidate();
      refetchResults?.();
      refetchVolunteerResults?.();
      
      setCheckoutSuccessCamper(activeCamperName || "Camper");
      
      // Clear form
      setCollectorName("");
      setCollectorRelationship("");
      setSignatureData("");
      setParentPin("");
      setSearchQuery("");
      setActiveQuery(null);
    },
    onError: (err) => {
      setErrorData(err.message);
    },
  });

  // Auto-focus search on desktop only — see CheckInShell for why mobile skips this.
  useEffect(() => {
    if (!isMobile) searchInputRef.current?.focus();
  }, [isMobile]);

  // Scanning is the primary mobile action — launch the camera immediately,
  // once per visit, so closing it manually sticks.
  useEffect(() => {
    if (isMobile && !autoLaunchedRef.current) {
      autoLaunchedRef.current = true;
      setScannerActive(true);
    }
  }, [isMobile]);

  const handleScanSuccess = async (qrToken: string) => {
    setScannerActive(false);
    setActiveQuery({ qrToken });
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

  const handleGuardianChange = (e: any, camperObj: any) => {
    const value = e.target.value;
    setCollectorType(value);

    const parentUser = camperObj.camper?.user || camperObj.user;
    const parentName = parentUser ? `${parentUser.firstName ?? ""} ${parentUser.lastName ?? ""}`.trim() : "";
    const emergencyName = camperObj.camper?.emergencyContactName || camperObj.emergencyContactName || "";
    const emergencyRel = camperObj.camper?.relationship || camperObj.relationship || "";

    if (value === "PARENT") {
      setCollectorName(parentName);
      setCollectorRelationship("Parent / Guardian");
    } else if (value === "EMERGENCY") {
      setCollectorName(emergencyName);
      setCollectorRelationship(emergencyRel || "Emergency Contact");
    } else {
      setCollectorName("");
      setCollectorRelationship("");
    }
  };

  const currentResults = isVolunteer ? volunteerResults : results;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={title} />

      {/* ═══ STEP 1: SCANNER PANEL ═══ */}
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

      {/* ═══ STEP 2: SEARCH BOX ═══ */}
      <Card className="border-neutral-200">
        <CardBody className="p-6">
          <form onSubmit={handleSearchSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-neutral-400" />
              <Input
                ref={searchInputRef}
                containerClassName="w-full"
                className="pl-10 h-11 text-sm rounded-lg"
                placeholder={isVolunteer ? "Registration #, camper name" : "Registration #, camper name, parent phone"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" className="h-11">Search</Button>
            {activeQuery && (
              <Button type="button" size="lg" variant="secondary" onClick={clearQuery}>Clear</Button>
            )}
          </form>
        </CardBody>
      </Card>

      {/* ═══ STEP 3: SEARCH RESULTS WORKSPACE ═══ */}
      {activeQuery && (currentResults ?? []).length === 0 && (
        <div className="rounded-xl bg-warning-50 p-4 border border-warning-100 text-sm text-warning-700 flex justify-between items-center animate-fade-in">
          <span>No matching camper found. Ensure the camper is currently checked in.</span>
          <button onClick={clearQuery} className="text-xs font-bold underline">Dismiss</button>
        </div>
      )}

      {(currentResults ?? []).map((r: any) => {
        const regId = r.registrationId || r.id;
        const regNo = r.registrationNumber;
        const camperName = r.name || r.camper?.name;
        const photo = r.photoUrl || r.camper?.photoUrl;
        const isCheckedIn = r.checkedInAt || r.status === "CHECKED_IN";
        const isCheckedOut = !!r.checkedOutAt;
        
        // Setup initial default name on first load of camper
        const parentUser = r.camper?.user || r.user;
        const parentName = parentUser ? `${parentUser.firstName ?? ""} ${parentUser.lastName ?? ""}`.trim() : "";

        return (
          <Card key={regId} className="border-neutral-200 shadow animate-fade-in">
            <CardBody className="p-6 space-y-6">
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
                    <Badge tone={isCheckedOut ? "neutral" : isCheckedIn ? "info" : "danger"}>
                      {isCheckedOut ? "Checked Out" : isCheckedIn ? "Currently Checked In" : "Not Checked In"}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">{regNo}</p>
                </div>
              </div>

              {isCheckedIn && !isCheckedOut && (
                <div className="border-t border-neutral-100 pt-4 space-y-4">
                  <h3 className="text-sm font-bold text-neutral-700 uppercase tracking-wider">Secure Collection Details</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                      label="Approved Guardians"
                      value={collectorType}
                      onChange={(e) => handleGuardianChange(e, r)}
                    >
                      <option value="PARENT">Parent/Guardian ({parentName || "Primary User"})</option>
                      {(r.camper?.emergencyContactName || r.emergencyContactName) && (
                        <option value="EMERGENCY">Emergency ({r.camper?.emergencyContactName || r.emergencyContactName})</option>
                      )}
                      <option value="OTHER">Other collector...</option>
                    </Select>

                    <Input
                      label="Collector Full Name"
                      placeholder="Enter collector's name..."
                      value={collectorName || (collectorType === "PARENT" ? parentName : "")}
                      onChange={(e) => setCollectorName(e.target.value)}
                      disabled={collectorType !== "OTHER"}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Relationship to Camper"
                      placeholder="e.g. Aunt, Uncle, Family Friend"
                      value={collectorRelationship || (collectorType === "PARENT" ? "Parent / Guardian" : "")}
                      onChange={(e) => setCollectorRelationship(e.target.value)}
                      disabled={collectorType !== "OTHER"}
                      required
                    />
                    
                    <Input
                      label="Parent collection PIN (Optional)"
                      placeholder="e.g. 1234"
                      type="password"
                      value={parentPin}
                      onChange={(e) => setParentPin(e.target.value)}
                    />
                  </div>

                  <CheckoutSignaturePad
                    onSave={(dataUrl) => setSignatureData(dataUrl)}
                    onClear={() => setSignatureData("")}
                  />

                  <div className="pt-2 flex gap-3">
                    <Button
                      size="lg"
                      className="bg-accent-600 hover:bg-accent-700 text-white font-bold h-12 px-8 shadow"
                      loading={checkOut.isPending}
                      disabled={!collectorName || !collectorRelationship || !signatureData}
                      onClick={() => {
                        setActiveCamperName(camperName);
                        checkOut.mutate({
                          registrationId: regId,
                          collectorName,
                          collectorRelationship,
                          details: { signatureDataUrl: signatureData, verificationMethod: collectorType, pin: parentPin },
                        });
                      }}
                    >
                      Confirm Checkout
                    </Button>
                    
                    {!isVolunteer && (
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={() => setSelectedRegistrationId(regId)}
                      >
                        View Timeline
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}

      {/* ═══ SUCCESS CHECKOUT OVERLAY ═══ */}
      {checkoutSuccessCamper && (
        <div
          onClick={() => setCheckoutSuccessCamper(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-600 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white cursor-pointer animate-fade-in"
        >
          <div className="flex flex-col items-center max-w-md text-center space-y-4">
            <CheckCircleIcon className="h-24 w-24 md:h-32 md:w-32 animate-bounce" />
            <h1 className="text-4xl md:text-5xl font-black">Checked Out</h1>
            <p className="text-xl md:text-2xl font-semibold opacity-95">{checkoutSuccessCamper} has been safely checked out.</p>
            <p className="text-xs opacity-60 pt-4">Tapping anywhere will return to scanning</p>
          </div>
        </div>
      )}

      {errorData && (
        <ErrorOverlay
          title="Checkout Failed"
          message={errorData}
          onDismiss={() => {
            setErrorData(null);
            setScannerActive(true);
          }}
        />
      )}

      <Dialog open={!!selectedRegistrationId} onClose={() => setSelectedRegistrationId(null)} title="Registration Timeline">
        <AuditTimeline events={timeline ?? []} />
      </Dialog>

      {!scannerActive && !checkoutSuccessCamper && !errorData && (
        <Fab icon={<QrCodeIcon className="h-6 w-6" />} label="Scan camper QR code" onClick={() => setScannerActive(true)} />
      )}
    </div>
  );
}
