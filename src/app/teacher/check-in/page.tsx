"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { StaffGate } from "@/components/staff/StaffGate";
import { CheckInShell } from "@/components/staff/shared/CheckInShell";

export default function TeacherCheckInPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="teacher">
      <StaffGate>
        {() => <CheckInShell organizationId={organizationId} title="Check-in" />}
      </StaffGate>
    </AppShell>
  );
}
