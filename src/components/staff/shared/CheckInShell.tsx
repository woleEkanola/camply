"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { AuditTimeline } from "@/components/staff/shared/AuditTimeline";

type ExtendedUser = { id: string; role: string; organizationId?: string };

function CopyContact({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className="text-neutral-500">{label}:</span>{" "}
      <span className="font-medium text-neutral-900">{value}</span>{" "}
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-xs text-accent-700 hover:underline"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function outcomeFor(registration: any): { label: string; tone: BadgeTone; canCheckIn: boolean; canCheckOut: boolean } {
  if (registration.status === "CANCELLED") return { label: "Registration Cancelled", tone: "danger", canCheckIn: false, canCheckOut: false };
  if (registration.status === "REJECTED") return { label: "Registration Rejected", tone: "danger", canCheckIn: false, canCheckOut: false };
  if (registration.status === "CHECKED_IN") return { label: "Already Checked In", tone: "info", canCheckIn: false, canCheckOut: true };
  if (registration.status !== "APPROVED") return { label: `Not Ready (${registration.status.replace(/_/g, " ")})`, tone: "neutral", canCheckIn: false, canCheckOut: false };
  return { label: "Ready for Check-in", tone: "success", canCheckIn: true, canCheckOut: false };
}

export function CheckInShell({ organizationId, title = "Check-in" }: { organizationId: string; title?: string }) {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<{ qrToken?: string; query?: string } | null>(null);

  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);

  const { data: results, refetch } = api.registration.lookupForCheckIn.useQuery(
    { organizationId, ...(activeQuery ?? {}) },
    { enabled: !!organizationId && !!activeQuery }
  );

  const { data: timeline } = api.registration.timeline.useQuery(
    { registrationId: selectedRegistrationId ?? "" },
    { enabled: !!selectedRegistrationId }
  );

  const utils = api.useUtils();
  const checkIn = api.registration.checkIn.useMutation({
    onSuccess: () => {
      refetch();
      utils.registration.lookupForCheckIn.invalidate();
      setTokenInput("");
      tokenInputRef.current?.focus();
    },
  });
  const checkOut = api.registration.checkOut.useMutation({ onSuccess: () => refetch() });

  useEffect(() => {
    tokenInputRef.current?.focus();
  }, []);

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setActiveQuery({ qrToken: tokenInput.trim() });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setActiveQuery({ query: searchQuery.trim() });
  };

  const clear = () => {
    setActiveQuery(null);
    setTokenInput("");
    setSearchQuery("");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={title} />

      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Scan QR (USB scanner or paste token)</h2>
          <form onSubmit={handleTokenSubmit} className="flex gap-2">
            <Input
              ref={tokenInputRef}
              containerClassName="flex-1"
              placeholder="Scan or paste QR token..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              autoFocus
            />
            <Button type="submit">Lookup</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Manual Search</h2>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input
              containerClassName="flex-1"
              placeholder="Registration #, camper name, email, or phone"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button type="submit">Search</Button>
          </form>
        </CardBody>
      </Card>

      {activeQuery && (results ?? []).length === 0 && (
        <div className="rounded-lg bg-warning-50 p-4 text-sm text-warning-700">
          QR Code Not Recognized / No results found.
          <button onClick={clear} className="ml-3 text-xs underline">Clear</button>
        </div>
      )}

      {(results ?? []).map((registration: any) => {
        const outcome = outcomeFor(registration);
        const hasMedicalAlert = registration.camper?.allergies || registration.camper?.medicalConditions;
        return (
          <Card key={registration.id}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-neutral-900">{registration.camper?.name}</div>
                  <div className="text-sm text-neutral-500">{registration.registrationNumber}</div>
                </div>
                <Badge tone={outcome.tone}>{outcome.label}</Badge>
              </div>

              {registration.warnings?.length > 0 && (
                <div className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800">
                  <div className="font-medium">Check-in warnings</div>
                  <ul className="mt-1 list-disc pl-4">
                    {registration.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {hasMedicalAlert && (
                <div className="space-y-2 rounded-lg border border-danger-300 bg-danger-50 p-3">
                  <div className="font-semibold text-danger-800">⚠ Medical Alert</div>
                  <div className="flex flex-wrap gap-2">
                    {registration.camper.allergies && <Badge tone="danger">Allergies: {registration.camper.allergies}</Badge>}
                    {registration.camper.medicalConditions && <Badge tone="danger">Conditions: {registration.camper.medicalConditions}</Badge>}
                    {registration.camper.medications && <Badge tone="danger">Meds: {registration.camper.medications}</Badge>}
                    {registration.camper.dietaryRestrictions && <Badge tone="danger">Diet: {registration.camper.dietaryRestrictions}</Badge>}
                  </div>
                </div>
              )}

              {(registration.camper?.emergencyContactName || registration.camper?.emergencyContactPhone || registration.camper?.parentPhone || registration.camper?.teenPhone) && (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                  <div className="mb-1 font-medium text-neutral-700">Emergency / Contact</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {registration.camper.emergencyContactName && (
                      <div>
                        <span className="text-neutral-500">{registration.camper.relationship ?? "Emergency"}:</span>{" "}
                        <span className="font-medium text-neutral-900">{registration.camper.emergencyContactName}</span>
                      </div>
                    )}
                    {registration.camper.emergencyContactPhone && (
                      <CopyContact label="Emergency Phone" value={registration.camper.emergencyContactPhone} />
                    )}
                    {registration.camper.parentPhone && <CopyContact label="Parent Phone" value={registration.camper.parentPhone} />}
                    {registration.camper.teenPhone && <CopyContact label="Teen Phone" value={registration.camper.teenPhone} />}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="font-medium text-neutral-700">Camp:</span> {registration.camp?.name}</div>
                <div><span className="font-medium text-neutral-700">Centre:</span> {registration.campus?.name}</div>
                {registration.tribe && <div><span className="font-medium text-neutral-700">Tribe:</span> {registration.tribe.name}</div>}
                {registration.room && <div><span className="font-medium text-neutral-700">Room:</span> {registration.room.name}</div>}
                {registration.bed && <div><span className="font-medium text-neutral-700">Bed:</span> {registration.bed.label}</div>}
                <div><span className="font-medium text-neutral-700">Gender:</span> {registration.camper?.gender || "—"}</div>
                <div><span className="font-medium text-neutral-700">DOB:</span> {registration.camper?.dateOfBirth ? new Date(registration.camper.dateOfBirth).toLocaleDateString() : "—"}</div>
              </div>

              {registration.checkedInAt && (
                <div className="text-xs text-neutral-500">
                  Checked in: {new Date(registration.checkedInAt).toLocaleString()}
                  {registration.checkedInByName && ` by ${registration.checkedInByName}`}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {outcome.canCheckIn && (
                  <Button className="bg-success-600 text-white hover:bg-success-700" loading={checkIn.isPending} onClick={() => checkIn.mutate({ registrationId: registration.id })}>
                    Check In
                  </Button>
                )}
                {outcome.canCheckOut && (
                  <Button variant="secondary" disabled={!!registration.checkedOutAt} loading={checkOut.isPending} onClick={() => checkOut.mutate({ registrationId: registration.id })}>
                    {registration.checkedOutAt ? "Checked Out" : "Check Out"}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setSelectedRegistrationId(registration.id)}>
                  View Timeline
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      })}

      <Dialog open={!!selectedRegistrationId} onClose={() => setSelectedRegistrationId(null)} title="Registration Timeline">
        <AuditTimeline events={timeline ?? []} />
      </Dialog>
    </div>
  );
}
