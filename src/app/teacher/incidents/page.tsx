"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { IncidentsPage } from "@/components/staff/IncidentsPage";

export default function TeacherIncidentsPage() {
  const router = useRouter();
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  return (
    <AppShell area="teacher">
      <PageHeader title="Incidents" />
      <StaffGate>{(profile) => <IncidentsPage campId={profile.campId} />}</StaffGate>
    </AppShell>
  );
}
