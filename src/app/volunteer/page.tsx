"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StaffGate } from "@/components/staff/StaffGate";

const DEPARTMENT_ACTIONS: Record<string, { label: string; href: string }[]> = {
  Medical: [{ label: "Medical Tools", href: "/volunteer/medical" }],
  Kitchen: [{ label: "Meal Distribution", href: "/volunteer/meals" }],
  Registration: [{ label: "Check-in / QR Scanner", href: "/volunteer/check-in" }],
};

function VolunteerDashboardContent({ profile }: { profile: any }) {
  const router = useRouter();
  const { data: notifications = [] } = api.notification.listMine.useQuery(undefined, { enabled: true });
  const departmentActions = DEPARTMENT_ACTIONS[profile.volunteerCategory ?? ""] ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardBody><div className="text-xs text-neutral-500">Department</div><div className="mt-1 font-medium text-neutral-900">{profile.volunteerCategory ?? "Unassigned"}</div></CardBody></Card>
        <Card><CardBody><div className="text-xs text-neutral-500">My Centre</div><div className="mt-1 font-medium text-neutral-900">{profile.assignedLocation?.name ?? "Unassigned"}</div></CardBody></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h3 className="mb-3 font-medium text-neutral-900">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              {departmentActions.map((a) => (
                <Button key={a.href} size="sm" onClick={() => router.push(a.href)}>{a.label}</Button>
              ))}
              <Button size="sm" variant="secondary" onClick={() => router.push("/volunteer/incidents")}>Report Incident</Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h3 className="mb-3 font-medium text-neutral-900">Announcements</h3>
            <div className="space-y-2">
              {notifications.slice(0, 5).map((n: any) => (
                <div key={n.id} className="text-sm">
                  <div className="font-medium text-neutral-900">{n.title}</div>
                  <div className="text-neutral-500">{n.body}</div>
                </div>
              ))}
              {notifications.length === 0 && <p className="text-sm text-neutral-500">No announcements yet.</p>}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function VolunteerDashboardPage() {
  const router = useRouter();
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  return (
    <AppShell area="volunteer">
      <PageHeader title="Volunteer Dashboard" />
      <StaffGate>{(profile) => <VolunteerDashboardContent profile={profile} />}</StaffGate>
    </AppShell>
  );
}
