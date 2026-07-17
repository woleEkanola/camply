"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { StaffTodayPanel } from "@/components/staff/shared/StaffTodayPanel";

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  return (
    <AppShell area="teacher">
      <PageHeader title="Teacher Dashboard" />
      <StaffGate>
        {(profile) => (
          <StaffTodayPanel organizationId={organizationId} campId={activeCamp?.id} profile={profile} />
        )}
      </StaffGate>
    </AppShell>
  );
}
