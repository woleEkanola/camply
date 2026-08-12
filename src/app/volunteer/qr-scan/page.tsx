"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { StaffGate } from "@/components/staff/StaffGate";
import { ScanCenterShell } from "@/components/staff/shared/ScanCenterShell";

export default function VolunteerQrScanPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="volunteer">
      <StaffGate>
        {(profile) => (
          <ScanCenterShell organizationId={organizationId} homeCampusId={profile.preferredCampusId ?? undefined} pointsHref="/volunteer/tribe" />
        )}
      </StaffGate>
    </AppShell>
  );
}
