"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { StaffTodayPanel } from "@/components/staff/shared/StaffTodayPanel";

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  return (
    <AppShell area="teacher">
      <PageHeader title="Teacher Dashboard" />
      <StaffGate>
        {(profile) => (
          <div className="space-y-5">
            <section className="flex flex-col gap-4 rounded-xl border border-border-default bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {profile.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.photoUrl} alt={`${profile.firstName} ${profile.lastName}`} className="h-16 w-16 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent-100 text-xl font-bold text-accent-700">{profile.firstName?.[0]}{profile.lastName?.[0]}</span>
                )}
                <div><h2 className="font-semibold text-txt-primary">Your profile photo</h2><p className="text-sm text-txt-secondary">Upload a photo or replace your current one.</p></div>
              </div>
              <button type="button" onClick={() => router.push("/profile?tab=photo")} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">{profile.photoUrl ? "Replace photo" : "Upload photo"}</button>
            </section>
            <StaffTodayPanel organizationId={organizationId} campId={activeCamp?.id} profile={profile} />
          </div>
        )}
      </StaffGate>
    </AppShell>
  );
}
