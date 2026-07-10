"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

function Step({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="font-medium text-neutral-900">{value ?? "Unassigned"}</div>
    </div>
  );
}

export function MyPositionView() {
  const { data: session } = useSession();
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeYear } = api.year.getActiveYear.useQuery({ organizationId }, { enabled: !!organizationId });
  const yearId = activeYear?.id ?? "";

  const { data: position, isLoading } = api.orgStructure.getMyPosition.useQuery({ yearId }, { enabled: !!yearId });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!position) return <EmptyState title="No position information yet" description="Your registration may still be pending approval." />;

  const isTeacher = position.role === "TEACHER";
  const isVolunteer = position.role === "VOLUNTEER";

  return (
    <Card>
      <CardBody>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-accent-600">You Are Here</h2>
        <div className="space-y-3">
          <Step label={position.title ?? "Role"} value={position.role} />
          {isTeacher && <Step label="Tribe" value={position.tribe} />}
          <Step label="Centre" value={position.centre} />
          {(isTeacher || isVolunteer) && <Step label="Department" value={position.department} />}
          <Step label="Reports To" value={position.reportsTo} />
          {position.directReportsCount !== null && <Step label="Direct Reports" value={position.directReportsCount} />}
          {isTeacher && (
            <>
              <Step label="Campers" value={position.camperCount} />
              <Step label="Hostel" value={position.hostel} />
              <Step label="Room" value={position.room} />
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
