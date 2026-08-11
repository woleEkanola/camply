"use client";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { CampPointsWorkspace } from "@/components/campPoints/CampPointsWorkspace";
import { api } from "@/utils/trpc";

export default function TeacherPointsPage() {
  const { data: session } = useSession({ required: true });
  const organizationId = session?.user?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  return <AppShell area="teacher"><PageHeader title="Camp Points" />{activeCamp ? <StaffGate>{() => <CampPointsWorkspace campId={activeCamp.id} organizationId={organizationId} />}</StaffGate> : <p className="text-sm text-txt-muted">No active camp.</p>}</AppShell>;
}
