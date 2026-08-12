"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { StaffDashboardEssentials } from "@/components/staff/shared/StaffDashboardEssentials";

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = session?.user?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  return <AppShell area="teacher"><PageHeader title="Teacher Dashboard" /><StaffGate>{(profile) => <StaffDashboardEssentials area="teacher" organizationId={organizationId} campId={activeCamp?.id} profile={profile} />}</StaffGate></AppShell>;
}
