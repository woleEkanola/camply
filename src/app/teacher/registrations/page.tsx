"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { RegistrationQueue } from "@/components/staff/shared/RegistrationQueue";

export default function TeacherRegistrationsPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  const managedCampuses: string[] = (session?.user as any)?.managedCampuses || [];
  const organizationId = (session?.user as any)?.organizationId ?? "";

  if (status === "loading") {
    return (
      <AppShell area="teacher">
        <div className="flex h-screen items-center justify-center">Loading...</div>
      </AppShell>
    );
  }

  if (managedCampuses.length === 0) {
    return (
      <AppShell area="teacher">
        <div className="text-sm text-danger-600">You are not assigned to any campuses.</div>
      </AppShell>
    );
  }

  return (
    <AppShell area="teacher">
      <RegistrationQueue organizationId={organizationId} managedCampuses={managedCampuses} />
    </AppShell>
  );
}
