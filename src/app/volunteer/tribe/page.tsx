"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { EmptyState } from "@/components/ui/EmptyState";
import { TribeHub } from "@/components/tribes/TribeHub";
import { api } from "@/utils/trpc";

export default function VolunteerTribePage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: camp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  return <AppShell area="volunteer"><PageHeader title="My Tribe" description="Your tribe roster, attendance and points hub." />
    <StaffGate>{() => camp ? <TribeHub campId={camp.id} organizationId={organizationId} /> : <EmptyState title="No active camp" description="Your tribe hub will appear when a camp is active." />}</StaffGate>
  </AppShell>;
}
