"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StaffGate } from "@/components/staff/StaffGate";
import { CampDirectory } from "@/components/orgStructure/CampDirectory";

export default function TeacherCampContactPage() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated: () => router.push("/login"),
  });
  const organizationId = session?.user?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  return (
    <AppShell area="teacher">
      <PageHeader
        title="Camp Contact"
        description={activeCamp ? `Find camp leaders, teachers, and volunteers for ${activeCamp.name}` : undefined}
      />
      <StaffGate>
        {() =>
          activeCamp ? (
            <CampDirectory organizationId={organizationId} campId={activeCamp.id} readOnly />
          ) : (
            <EmptyState title="No active camp" description="Camp contacts will appear when an active camp is available." />
          )
        }
      </StaffGate>
    </AppShell>
  );
}
