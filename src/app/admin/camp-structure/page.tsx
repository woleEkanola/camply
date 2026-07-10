"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { DepartmentManager } from "@/components/orgStructure/DepartmentManager";
import { AccommodationManager } from "@/components/orgStructure/AccommodationManager";
import { LeadershipTreeTab } from "@/components/orgStructure/LeadershipTreeTab";
import { TribeGrid } from "@/components/orgStructure/TribeGrid";
import { CampStructureSearch } from "@/components/orgStructure/CampStructureSearch";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

export default function CampStructurePage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  useEffect(() => {
    if (status === "authenticated" && !ADMIN_ROLES.includes((session?.user as any)?.role ?? "")) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  const campId = activeCamp?.id ?? "";

  return (
    <AppShell area="admin">
      <PageHeader title="Camp Structure" description={activeCamp ? `For ${activeCamp.name}` : undefined} />

      {!campId ? (
        <EmptyState title="No active camp" description="Set an active camp before managing camp structure." />
      ) : (
        <>
        <CampStructureSearch organizationId={organizationId} campId={campId} />
        <Tabs
          tabs={[
            { label: "Leadership", content: <LeadershipTreeTab organizationId={organizationId} campId={campId} /> },
            { label: "Departments", content: <DepartmentManager organizationId={organizationId} campId={campId} /> },
            { label: "Tribes", content: <TribeGrid organizationId={organizationId} campId={campId} /> },
            { label: "Accommodation", content: <AccommodationManager organizationId={organizationId} campId={campId} /> },
          ]}
        />
        </>
      )}
    </AppShell>
  );
}
