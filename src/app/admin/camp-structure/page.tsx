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

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"];

export default function CampStructurePage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  useEffect(() => {
    if (status === "authenticated" && !ADMIN_ROLES.includes((session?.user as any)?.role ?? "")) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeYear } = api.year.getActiveYear.useQuery({ organizationId }, { enabled: !!organizationId });
  const yearId = activeYear?.id ?? "";

  return (
    <AppShell area="admin">
      <PageHeader title="Camp Structure" description={activeYear ? `For ${activeYear.name}` : undefined} />

      {!yearId ? (
        <EmptyState title="No active camp" description="Set an active camp year before managing camp structure." />
      ) : (
        <>
        <CampStructureSearch organizationId={organizationId} yearId={yearId} />
        <Tabs
          tabs={[
            { label: "Leadership", content: <LeadershipTreeTab organizationId={organizationId} yearId={yearId} /> },
            { label: "Departments", content: <DepartmentManager organizationId={organizationId} yearId={yearId} /> },
            { label: "Tribes", content: <TribeGrid organizationId={organizationId} yearId={yearId} /> },
            { label: "Accommodation", content: <AccommodationManager organizationId={organizationId} /> },
          ]}
        />
        </>
      )}
    </AppShell>
  );
}
