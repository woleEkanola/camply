"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { DepartmentsWorkspace } from "@/components/departments/DepartmentsWorkspace";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { api } from "@/utils/trpc";

export default function TeacherDepartmentsPage() {
  const { data: session } = useSession({ required: true });
  const organizationId = session?.user?.organizationId ?? "";
  const { data: camp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  return <AppShell area="teacher"><PageHeader title="Departments" description="Your team, today’s work, reporting structure, and camp contacts." /><StaffGate>{() => camp ? <DepartmentsWorkspace organizationId={organizationId} campId={camp.id} staffArea /> : <EmptyState title="No active camp" description="Departments appear when a camp is active." />}</StaffGate></AppShell>;
}
