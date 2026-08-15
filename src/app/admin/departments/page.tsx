"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { DepartmentsWorkspace } from "@/components/departments/DepartmentsWorkspace";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/utils/trpc";

export default function DepartmentsPage() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId ?? "";
  const { data: camp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  return <AppShell area="admin"><PageHeader title="Departments" description="People, reporting lines, contacts, responsibilities, and daily operations in one place." />{camp ? <DepartmentsWorkspace organizationId={organizationId} campId={camp.id} canManageAll /> : <EmptyState title="No active camp" description="Set an active camp before configuring departments." />}</AppShell>;
}
