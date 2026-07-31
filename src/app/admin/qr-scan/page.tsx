"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { ScanCenterShell } from "@/components/staff/shared/ScanCenterShell";

export default function AdminQrScanPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="admin">
      {/* No defaultStationId: unified check-in/check-out page — a fresh
          session lands on the safe, read-only Identity Lookup station; the
          volunteer switches to Camp Arrival, Checkout, or any other
          station from the station sheet. */}
      <ScanCenterShell organizationId={organizationId} />
    </AppShell>
  );
}
