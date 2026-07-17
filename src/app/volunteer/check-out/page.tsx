"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { StaffGate } from "@/components/staff/StaffGate";
import { CheckOutShell } from "@/components/staff/shared/CheckOutShell";

export default function VolunteerCheckOutPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="volunteer">
      <StaffGate>
        {(profile) => {
          if (profile.volunteerCategory !== "Registration") {
            return (
              <div className="max-w-md mx-auto mt-10 text-center space-y-2">
                <p className="text-lg font-bold text-neutral-800">Access Denied</p>
                <p className="text-sm text-neutral-500">Check-out is only available to Registration department volunteers.</p>
              </div>
            );
          }
          return <CheckOutShell organizationId={organizationId} title="Volunteer Check-out Workspace" />;
        }}
      </StaffGate>
    </AppShell>
  );
}
