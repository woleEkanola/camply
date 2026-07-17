"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { StaffGate } from "@/components/staff/StaffGate";
import { CheckOutShell } from "@/components/staff/shared/CheckOutShell";

export default function TeacherCheckOutPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="teacher">
      <StaffGate>
        {() => <CheckOutShell organizationId={organizationId} title="Teacher Check-out Workspace" />}
      </StaffGate>
    </AppShell>
  );
}
