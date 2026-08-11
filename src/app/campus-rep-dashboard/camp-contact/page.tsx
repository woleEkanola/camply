"use client";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampDirectory } from "@/components/orgStructure/CampDirectory";
import { api } from "@/utils/trpc";

export default function CampusRepCampContactPage() {
  const { data: session } = useSession({ required: true });
  const organizationId = session?.user?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  return <AppShell area="campus-rep"><PageHeader title="Camp Contact" description={activeCamp ? `Find camp leaders and teams for ${activeCamp.name}` : undefined} />{activeCamp ? <CampDirectory organizationId={organizationId} campId={activeCamp.id} readOnly /> : <EmptyState title="No active camp" description="Camp contacts appear when a camp is active." />}</AppShell>;
}
