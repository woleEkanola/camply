"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { api } from "@/utils/trpc";

export default function CampusRepresentativeAssignmentPage() {
  const { data: session } = useSession({ required: true });
  const user = session?.user as ({ organizationId?: string; managedCampuses?: string[] }) | undefined;
  const organizationId = user?.organizationId ?? "";
  const managedIds = user?.managedCampuses ?? [];
  const { data: campuses = [], isLoading } = api.campus.getByOrganization.useQuery(
    { organizationId },
    { enabled: !!organizationId },
  );
  const assigned = campuses.filter((campus) => managedIds.includes(campus.id));

  return (
    <AppShell area="campus-rep">
      <PageHeader title="My Assignment" description="The campuses you are allowed to manage during camp." />
      <Card>
        <CardBody className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-txt-muted">Role</p>
            <p className="mt-1 font-semibold text-txt-primary">Campus Representative</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-txt-muted">Assigned campuses</p>
            {isLoading ? (
              <p className="mt-2 text-sm text-txt-muted">Loading assignments…</p>
            ) : assigned.length ? (
              <ul className="mt-2 space-y-2">
                {assigned.map((campus) => <li key={campus.id} className="rounded-lg border border-border-default bg-surface-muted px-3 py-2 text-sm font-medium text-txt-primary">{campus.name}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-txt-muted">No campus has been assigned to you yet.</p>
            )}
          </div>
        </CardBody>
      </Card>
    </AppShell>
  );
}
