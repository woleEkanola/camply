"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

type ExtendedUser = { id: string; role: string; organizationId?: string };

function outcomeFor(registration: any): { label: string; tone: BadgeTone; canCheckIn: boolean; canCheckOut: boolean } {
  if (registration.status === "CANCELLED") return { label: "Registration Cancelled", tone: "danger", canCheckIn: false, canCheckOut: false };
  if (registration.status === "REJECTED") return { label: "Registration Rejected", tone: "danger", canCheckIn: false, canCheckOut: false };
  if (registration.status === "CHECKED_IN") return { label: "Already Checked In", tone: "info", canCheckIn: false, canCheckOut: true };
  if (registration.status !== "APPROVED") return { label: `Not Ready (${registration.status})`, tone: "neutral", canCheckIn: false, canCheckOut: false };
  return { label: "Ready for Check-in", tone: "success", canCheckIn: true, canCheckOut: false };
}

export default function CheckInPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  useEffect(() => {
    if (status === "authenticated" && !["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"].includes((session?.user as ExtendedUser)?.role ?? "")) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<{ qrToken?: string; query?: string } | null>(null);

  const { data: results, refetch } = api.registration.lookupForCheckIn.useQuery(
    { organizationId, ...(activeQuery ?? {}) },
    { enabled: !!organizationId && !!activeQuery }
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

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title="Check-in" />

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
          <div className="rounded-lg bg-warning-50 p-4 text-sm text-warning-700">QR Code Not Recognized / No results found.</div>
        )}

        {(results ?? []).map((registration: any) => {
          const outcome = outcomeFor(registration);
          const hasMedicalAlert = registration.camper?.allergies || registration.camper?.medicalConditions;
          return (
            <Card key={registration.id}>
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-neutral-900">{registration.camper?.name}</div>
                    <div className="text-sm text-neutral-500">{registration.registrationNumber}</div>
                  </div>
                  <Badge tone={outcome.tone}>{outcome.label}</Badge>
                </div>

                {hasMedicalAlert && (
                  <div className="rounded-lg border border-danger-300 bg-danger-50 p-3 font-medium text-danger-800">
                    ⚠ Medical Alert: {registration.camper.allergies} {registration.camper.medicalConditions}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium text-neutral-700">Camp:</span> {registration.year?.name}</div>
                  <div><span className="font-medium text-neutral-700">Centre:</span> {registration.location?.name}</div>
                  {registration.tribe && <div><span className="font-medium text-neutral-700">Tribe:</span> {registration.tribe.name}</div>}
                  <div><span className="font-medium text-neutral-700">Gender:</span> {registration.camper?.gender || "—"}</div>
                  <div><span className="font-medium text-neutral-700">DOB:</span> {registration.camper?.dateOfBirth ? new Date(registration.camper.dateOfBirth).toLocaleDateString() : "—"}</div>
                </div>

                {registration.checkedInAt && (
                  <div className="text-xs text-neutral-500">Checked in: {new Date(registration.checkedInAt).toLocaleString()}</div>
                )}

                <div className="flex gap-2">
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
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
