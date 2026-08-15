"use client";

import Link from "next/link";
import { MyPositionView } from "@/components/orgStructure/MyPositionView";
import { StaffTodayPanel } from "./StaffTodayPanel";

type StaffArea = "teacher" | "volunteer" | "campus-rep";

const ROUTES: Record<StaffArea, { tribe: string; inbox: string; incidents: string }> = {
  teacher: { tribe: "/teacher/tribe", inbox: "/teacher/inbox", incidents: "/teacher/incidents" },
  volunteer: { tribe: "/volunteer/tribe", inbox: "/volunteer/inbox", incidents: "/volunteer/incidents" },
  "campus-rep": { tribe: "/campus-rep-dashboard/tribe", inbox: "/campus-rep-dashboard/inbox", incidents: "/campus-rep-dashboard/incidents" },
};

export function StaffDashboardEssentials({ area, organizationId, campId, profile, mode = "full" }: { area: StaffArea; organizationId: string; campId?: string; profile?: any | null; mode?: "full" | "photo" | "details" }) {
  const roleName = area === "campus-rep" ? "Campus Representative" : area === "teacher" ? "Teacher" : "Volunteer";
  return <div className="space-y-5">
    {mode !== "details" && <Link aria-label={profile?.photoUrl ? "Replace photo" : "Upload photo"} href="/profile?tab=photo" className="flex w-full flex-col gap-4 rounded-xl border border-border-default bg-surface p-4 text-left transition hover:border-accent-300 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {profile?.photoUrl ? <img src={profile.photoUrl} alt={`${profile.firstName} ${profile.lastName}`} className="h-16 w-16 rounded-xl object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent-100 text-xl font-bold text-accent-700">{profile ? `${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}` : roleName[0]}</span>}
        <div><h2 className="font-semibold text-txt-primary">Your profile photo</h2><p className="text-sm text-txt-secondary">Upload a photo or replace your current one.</p></div>
      </div>
      <span className="rounded-lg bg-accent-600 px-4 py-2 text-center text-sm font-semibold text-white">{profile?.photoUrl ? "Replace photo" : "Upload photo"}</span>
    </Link>}

    {mode === "full" && profile && <StaffTodayPanel organizationId={organizationId} campId={campId} profile={profile} section="hero" />}

    {mode !== "photo" && <section className="space-y-3">
      <div><h2 className="text-lg font-bold text-txt-primary">My position</h2><p className="text-sm text-txt-secondary">Your role, reporting line, department, tribe, venue, and current responsibility.</p></div>
      <MyPositionView />
    </section>}

    {mode !== "photo" && <><Link href={ROUTES[area].tribe} className="flex w-full items-center justify-between rounded-xl border border-accent-500/30 bg-accent-500/10 p-4 text-left transition hover:border-accent-500 hover:bg-accent-500/15">
      <div><h2 className="font-semibold text-txt-primary">My Tribe Hub</h2><p className="text-sm text-txt-secondary">Open your tribe roster, teachers, attendance, and points workspace.</p></div><span className="text-sm font-bold text-accent-700">Open tribe →</span>
    </Link>

    <div className="grid gap-3 sm:grid-cols-2">
      <Link href={ROUTES[area].inbox} className="rounded-xl border border-border-default bg-surface p-4 text-left transition hover:border-accent-300 hover:bg-surface-hover"><span className="font-semibold text-txt-primary">Inbox</span><span className="mt-1 block text-sm text-txt-secondary">Read camp announcements and important messages.</span></Link>
      <Link href={ROUTES[area].incidents} className="rounded-xl border border-border-default bg-surface p-4 text-left transition hover:border-danger-300 hover:bg-danger-50"><span className="font-semibold text-txt-primary">Report an incident</span><span className="mt-1 block text-sm text-txt-secondary">Record safety, welfare, or behavioural concerns.</span></Link>
    </div></>}

    {mode === "full" && profile && <StaffTodayPanel organizationId={organizationId} campId={campId} profile={profile} section="operations" />}
  </div>;
}
