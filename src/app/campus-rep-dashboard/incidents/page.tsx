"use client";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { IncidentsPage } from "@/components/staff/IncidentsPage";
import { api } from "@/utils/trpc";

export default function CampusRepIncidentsPage() {
  const { data: session } = useSession({ required: true });
  const organizationId = session?.user?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  return <AppShell area="campus-rep"><PageHeader title="Incidents" />{activeCamp ? <IncidentsPage campId={activeCamp.id} /> : <p className="text-sm text-txt-muted">No active camp.</p>}</AppShell>;
}
