"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccommodationManager } from "@/components/orgStructure/AccommodationManager";
import { EmptyState } from "@/components/ui/EmptyState";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

export default function AccommodationPage() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated: () => router.push("/login"),
  });

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
      <PageHeader title="Accommodation" description={activeCamp ? `For ${activeCamp.name}` : undefined} />

      {!campId ? (
        <EmptyState title="No active camp" description="Set an active camp before managing accommodation." />
      ) : (
        <AccommodationManager organizationId={organizationId} campId={campId} />
      )}
    </AppShell>
  );
}
