"use client";
 
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { StaffGate } from "@/components/staff/StaffGate";
import { ScanCenterShell } from "@/components/staff/shared/ScanCenterShell";
 
export default function VolunteerMealsPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";
 
  return (
    <AppShell area="volunteer">
      <StaffGate>
        {(profile) => {
          if (profile.volunteerCategory !== "Kitchen") {
            return (
              <div className="max-w-md mx-auto mt-10 text-center space-y-2">
                <p className="text-lg font-bold text-neutral-800">Access Denied</p>
                <p className="text-sm text-neutral-500">Meal distribution is only available to Kitchen department volunteers.</p>
              </div>
            );
          }
          return <ScanCenterShell organizationId={organizationId} defaultStationId="BREAKFAST" />;
        }}
      </StaffGate>
    </AppShell>
  );
}
