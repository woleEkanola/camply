"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StaffGate } from "@/components/staff/StaffGate";

function age(dob: string | null) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export default function TeacherCampersPage() {
  const router = useRouter();
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  return (
    <AppShell area="teacher">
      <PageHeader title="My Campers" />
      <StaffGate>
        {(profile) => {
          const assignments = profile.camperAssignments ?? [];
          if (assignments.length === 0) {
            return <EmptyState title="No campers assigned yet" description="A camp administrator will assign campers to you." />;
          }
          return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assignments.map((a: any) => {
                const camper = a.registration.camperProfile;
                const hasAlert = camper.allergies || camper.medicalConditions;
                const camperAge = age(camper.dateOfBirth);
                return (
                  <Card key={a.id}>
                    <CardBody>
                      <div className="mb-2 flex items-center gap-3">
                        {camper.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={camper.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-sm font-medium text-accent-700">
                            {camper.name?.[0]}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-medium text-neutral-900">{camper.name}</h3>
                            {hasAlert && <Badge tone="danger">Medical</Badge>}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {[camperAge ? `${camperAge}y` : null, camper.gender].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>

                      <div className="mb-3 space-y-1 text-xs text-neutral-500">
                        <div>Tribe: <span className="text-neutral-700">{a.registration.tribe?.name ?? "Unassigned"}</span></div>
                        <div>Room: <span className="text-neutral-700">{a.registration.room?.name ?? "Unassigned"}</span></div>
                      </div>

                      {camper.allergies && <p className="text-xs text-danger-600">Allergies: {camper.allergies}</p>}
                      {camper.medicalConditions && <p className="text-xs text-danger-600">Conditions: {camper.medicalConditions}</p>}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => router.push("/teacher/attendance")}>Record Attendance</Button>
                        <Button size="sm" variant="secondary" onClick={() => router.push("/teacher/incidents")}>Report Incident</Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          );
        }}
      </StaffGate>
    </AppShell>
  );
}
