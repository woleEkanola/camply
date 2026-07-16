"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { CampersList } from "@/components/staff/shared/CampersList";

export default function TeacherCampersPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  return (
    <AppShell area="teacher">
      <PageHeader title="Campers" />
      <StaffGate>
        {() => (
          <CampersList
            organizationId={organizationId}
            campId={activeCamp?.id}
            title="All Campers"
            emptyTitle="No campers found"
            emptyDescription="There are no campers registered for the active camp yet."
          />
        )}
      </StaffGate>
    </AppShell>
  );
}
