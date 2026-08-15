"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { StaffGate } from "@/components/staff/StaffGate";
import { ScanCenterShell } from "@/components/staff/shared/ScanCenterShell";

export default function TeacherQrScanPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="teacher">
      <StaffGate>
        {/* No defaultStationId: unified check-in/check-out page — a fresh
            session lands on the safe, read-only Identity Lookup station;
            the teacher switches station (Camp Arrival, Checkout, etc.)
            from the station sheet. homeCampusId pre-highlights the
            teacher's own campus in the Pickup Point picker. */}
        {(profile: any) => <ScanCenterShell organizationId={organizationId} homeCampusId={profile.preferredCampusId ?? undefined} pointsHref="/teacher/tribe" />}
      </StaffGate>
    </AppShell>
  );
}
