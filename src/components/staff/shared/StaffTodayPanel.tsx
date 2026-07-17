"use client";

import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";

export function StaffTodayPanel({
  organizationId,
  campId,
  profile,
}: {
  organizationId: string;
  campId?: string;
  profile?: any;
}) {
  const router = useRouter();
  const { data: summary } = api.attendance.todaySummary.useQuery(
    { organizationId, campId: campId ?? "" },
    { enabled: !!organizationId }
  );
  const { data: notifications = [] } = api.notification.listMine.useQuery(undefined, { enabled: true });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <div className="text-xs text-neutral-500">My Venue</div>
            <div className="mt-1 font-medium text-neutral-900">{profile?.assignedVenue?.name ?? "Unassigned"}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-xs text-neutral-500">My Tribe</div>
            <div className="mt-1 font-medium text-neutral-900">{profile?.assignedTribe?.name ?? "Unassigned"}</div>
          </CardBody>
        </Card>
        <StatCard label="Today's Attendance" value={summary?.total ?? 0} insight={summary ? `${summary.present} present` : undefined} />
        <StatCard label="Assigned Campers" value={profile?.camperAssignments?.length ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h3 className="mb-3 font-medium text-neutral-900">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => router.push("/teacher/attendance")}>Take Attendance</Button>
              <Button size="sm" variant="secondary" onClick={() => router.push("/teacher/campers")}>View Campers</Button>
              <Button size="sm" variant="secondary" onClick={() => router.push("/teacher/check-in")}>Check In</Button>
              <Button size="sm" variant="secondary" onClick={() => router.push("/teacher/incidents")}>Report Incident</Button>
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
