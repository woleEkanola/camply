"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StaffGate } from "@/components/staff/StaffGate";

function VolunteerMedicalContent({ profile, organizationId }: { profile: any; organizationId: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);
  const [complaint, setComplaint] = useState("");
  const [treatment, setTreatment] = useState("");

  const { data: results = [] } = api.staff.lookupCamper.useQuery(
    { organizationId, query: activeQuery },
    { enabled: !!organizationId && !!activeQuery }
  );

  const utils = api.useUtils();
  const { data: recent = [] } = api.medicalVisit.recent.useQuery({ organizationId, yearId: profile.yearId }, { enabled: !!organizationId });
  const createVisit = api.medicalVisit.create.useMutation({
    onSuccess: () => {
      setComplaint("");
      setTreatment("");
      utils.medicalVisit.recent.invalidate({ organizationId, yearId: profile.yearId });
    },
  });

  if (profile.volunteerCategory !== "Medical") {
    return <p className="text-sm text-neutral-500">Medical tools are only available to Medical department volunteers.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Search Camper</h2>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setActiveQuery(searchQuery); }}>
            <Input containerClassName="flex-1" placeholder="Name or registration #" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <Button type="submit">Search</Button>
          </form>
          <div className="mt-3 space-y-2">
            {results.map((r: any) => (
              <button
                key={r.registrationId}
                onClick={() => setSelectedRegistrationId(r.registrationId)}
                className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${selectedRegistrationId === r.registrationId ? "border-accent-600 bg-accent-50" : "border-neutral-200"}`}
              >
                <div className="font-medium text-neutral-900">{r.name}</div>
                {(r.allergies || r.medicalConditions) && <div className="text-xs text-danger-600">{r.allergies} {r.medicalConditions}</div>}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {selectedRegistrationId && (
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-medium text-neutral-700">Log Medical Visit</h2>
            <div className="space-y-3">
              <Input label="Complaint" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
              <Textarea label="Treatment" value={treatment} onChange={(e) => setTreatment(e.target.value)} rows={2} />
              <Button
                disabled={!complaint}
                loading={createVisit.isPending}
                onClick={() => createVisit.mutate({ organizationId, yearId: profile.yearId, registrationId: selectedRegistrationId, complaint, treatment })}
              >
                Log Visit
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Recent Visits</h2>
          <div className="space-y-2 text-sm">
            {recent.map((v: any) => (
              <div key={v.id} className="border-b border-neutral-100 py-2">
                <div className="font-medium text-neutral-900">{v.registration.camperProfile.name}</div>
                <div className="text-neutral-500">{v.complaint} — {new Date(v.visitedAt).toLocaleString()}</div>
              </div>
            ))}
            {recent.length === 0 && <p className="text-neutral-500">No visits logged yet.</p>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default function VolunteerMedicalPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="volunteer">
      <PageHeader title="Medical" />
      <StaffGate>{(profile) => <VolunteerMedicalContent profile={profile} organizationId={organizationId} />}</StaffGate>
    </AppShell>
  );
}
