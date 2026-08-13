"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { ScanCenterShell } from "@/components/staff/shared/ScanCenterShell";

const ALLOWED_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

export default function AdminQrScanPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const role = session?.user?.role ?? "";
  if (session && !ALLOWED_ROLES.includes(role) && !(session.user.capabilities?.campCommand?.[0]?.permissions ?? []).includes("QR_SCANNING")) {
    return <AppShell area="admin"><div className="rounded-xl border border-danger-200 bg-danger-50 p-6"><h1 className="text-xl font-bold">Access denied</h1><p className="mt-2 text-sm">QR scanning requires an administrator, campus representative, or Camp Command scanning appointment.</p></div></AppShell>;
  }

  return (
    <AppShell area="admin">
      {/* No defaultStationId: unified check-in/check-out page — a fresh
          session lands on the safe, read-only Identity Lookup station; the
          volunteer switches to Camp Arrival, Checkout, or any other
          station from the station sheet. */}
      <ScanCenterShell organizationId={organizationId} pointsHref="/admin/tribes" />
    </AppShell>
  );
}
