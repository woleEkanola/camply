"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { CheckOutShell } from "@/components/staff/shared/CheckOutShell";

export default function AdminCheckOutPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="admin">
      <CheckOutShell organizationId={organizationId} title="Admin Check-out Workspace" />
    </AppShell>
  );
}
