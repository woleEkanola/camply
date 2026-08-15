"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TribeHub } from "@/components/tribes/TribeHub";
import { api } from "@/utils/trpc";

export default function CampusRepresentativeTribePage() {
  const { data: session } = useSession({ required: true });
  const organizationId = session?.user?.organizationId ?? "";
  const { data: camp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  return <AppShell area="campus-rep"><PageHeader title="My Tribe" description="Your tribe roster, attendance, and points hub." />{camp ? <TribeHub campId={camp.id} organizationId={organizationId} /> : <EmptyState title="No active camp" description="Your tribe hub will appear when a camp is active." />}</AppShell>;
}
