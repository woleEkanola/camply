"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StaffGate } from "@/components/staff/StaffGate";

export default function VolunteerCheckInPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const [tokenInput, setTokenInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<{ qrToken?: string; query?: string } | null>(null);

  const { data: results, refetch } = api.staff.lookupCamper.useQuery(
    { organizationId, ...(activeQuery ?? {}) },
    { enabled: !!organizationId && !!activeQuery }
  );

  const checkIn = api.registration.checkIn.useMutation({
    onSuccess: () => {
      refetch();
      setTokenInput("");
      tokenInputRef.current?.focus();
    },
  });

  useEffect(() => {
    tokenInputRef.current?.focus();
  }, []);

  return (
    <AppShell area="volunteer">
      <PageHeader title="Check-in" />
      <StaffGate>
        {(profile) => {
          if (profile.volunteerCategory !== "Registration") {
            return <p className="text-sm text-neutral-500">Check-in is only available to Registration department volunteers.</p>;
          }
          return (
            <div className="mx-auto max-w-2xl space-y-6">
              <Card>
                <CardBody>
                  <h2 className="mb-2 text-sm font-medium text-neutral-700">Scan QR (USB scanner or paste token)</h2>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!tokenInput.trim()) return;
                      setActiveQuery({ qrToken: tokenInput.trim() });
                    }}
                  >
                    <Input ref={tokenInputRef} containerClassName="flex-1" placeholder="Scan or paste QR token..." value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} autoFocus />
                    <Button type="submit">Lookup</Button>
                  </form>
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <h2 className="mb-2 text-sm font-medium text-neutral-700">Manual Search</h2>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!searchQuery.trim()) return;
                      setActiveQuery({ query: searchQuery.trim() });
                    }}
                  >
                    <Input containerClassName="flex-1" placeholder="Registration #, camper name" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    <Button type="submit">Search</Button>
                  </form>
                </CardBody>
              </Card>

              {activeQuery && (results ?? []).length === 0 && (
                <div className="rounded-lg bg-warning-50 p-4 text-sm text-warning-700">Not recognized / no results found.</div>
              )}

              {(results ?? []).map((r: any) => (
                <Card key={r.registrationId}>
                  <CardBody className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold text-neutral-900">{r.name}</div>
                        <div className="text-sm text-neutral-500">{r.registrationNumber}</div>
                      </div>
                      <Badge tone={r.checkedInAt ? "info" : r.status === "APPROVED" ? "success" : "neutral"}>
                        {r.checkedInAt ? "Checked In" : r.status === "APPROVED" ? "Ready" : r.status}
                      </Badge>
                    </div>
                    {(r.allergies || r.medicalConditions) && (
                      <div className="rounded-lg border border-danger-300 bg-danger-50 p-3 font-medium text-danger-800">
                        ⚠ Medical Alert: {r.allergies} {r.medicalConditions}
                      </div>
                    )}
                    <div className="text-sm text-neutral-600">Tribe: {r.tribeName ?? "—"} · Centre: {r.centreName ?? "—"}</div>
                    {!r.checkedInAt && r.status === "APPROVED" && (
                      <Button className="bg-success-600 text-white hover:bg-success-700" loading={checkIn.isPending} onClick={() => checkIn.mutate({ registrationId: r.registrationId })}>
                        Check In
                      </Button>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          );
        }}
      </StaffGate>
    </AppShell>
  );
}
