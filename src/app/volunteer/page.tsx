"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StaffGate } from "@/components/staff/StaffGate";
import { StaffDashboardEssentials } from "@/components/staff/shared/StaffDashboardEssentials";
import {
  QrCodeIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  CakeIcon,
  PhoneIcon,
  MegaphoneIcon,
  SparklesIcon,
  MapPinIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";

function VolunteerDashboardContent({ profile }: { profile: any }) {
  const router = useRouter();
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });

  const { data: notifications = [] } = api.notification.listMine.useQuery(undefined, { enabled: true });
  const { data: statsData } = api.registration.getAdminListStats.useQuery(
    { organizationId, campusId: profile.campusId },
    { enabled: !!organizationId }
  );

  const checkedInCount = (statsData as any)?.countsByStatus?.CHECKED_IN ?? 0;
  const totalCount = (statsData as any)?.totalCount ?? 0;

  const category = profile.volunteerCategory || "General Crew";
  const campusName = profile.assignedLocation?.name || profile.campus?.name || "Main Camp Venue";

  return (
    <div className="space-y-6">
      <StaffDashboardEssentials area="volunteer" organizationId={organizationId} campId={activeCamp?.id} profile={profile} mode="photo" />

      {/* 1. HERO PROFILE & STATION BANNER */}
      <div className="relative overflow-hidden rounded-2xl border border-border-default bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-500/15 border border-accent-500/30 px-2.5 py-0.5 text-xs font-bold text-accent-400">
                <SparklesIcon className="h-3.5 w-3.5" />
                <span>VOLUNTEER</span>
              </span>
              <span className="inline-flex items-center rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                {category}
              </span>
            </div>
            <h2 className="text-2xl font-black text-txt-primary">
              Welcome back, {profile.firstName || "Volunteer"}! 👋
            </h2>
            <div className="flex items-center gap-2 text-xs text-txt-secondary">
              <MapPinIcon className="h-4 w-4 text-accent-500 shrink-0" />
              <span>Assigned Station: <strong className="text-txt-primary font-bold">{campusName}</strong></span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircleIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-txt-muted uppercase tracking-wider">Duty Status</div>
              <div className="text-sm font-bold text-emerald-400">Active On Duty</div>
            </div>
          </div>
        </div>
      </div>

      <StaffDashboardEssentials area="volunteer" organizationId={organizationId} campId={activeCamp?.id} profile={profile} mode="details" />

      {/* 2. PRIMARY QUICK ACTIONS GRID */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-txt-secondary">
          Core Operational Tools
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Universal QR Scanner (High Contrast Card) */}
          <button
            type="button"
            onClick={() => router.push("/volunteer/qr-scan")}
            className="group relative flex flex-col justify-between rounded-2xl border border-accent-500/40 bg-accent-500/10 p-5 text-left transition-all duration-200 hover:border-accent-500 hover:bg-accent-500/20 active:scale-[0.98] shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 text-white font-bold shadow-md group-hover:scale-105 transition-transform">
                <QrCodeIcon className="h-7 w-7" />
              </div>
              <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-accent-300">
                Primary Tool
              </span>
            </div>
            <div className="mt-4">
              <div className="text-base font-extrabold text-txt-primary group-hover:text-accent-400 transition-colors">
                QR Code Scanner
              </div>
              <div className="mt-0.5 text-xs text-txt-secondary">
                Scan camper badges for check-in, station access & validation.
              </div>
            </div>
          </button>

          {/* Assigned Campers & Tribes */}
          <button
            type="button"
            onClick={() => router.push("/volunteer/tribe")}
            className="group flex flex-col justify-between rounded-2xl border border-border-default bg-surface p-5 text-left transition-all duration-200 hover:border-neutral-700 hover:bg-surface-hover active:scale-[0.98] shadow-2xs"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30 group-hover:scale-105 transition-transform">
              <UserGroupIcon className="h-7 w-7" />
            </div>
            <div className="mt-4">
              <div className="text-base font-extrabold text-txt-primary group-hover:text-sky-400 transition-colors">
                My Tribe Hub
              </div>
              <div className="mt-0.5 text-xs text-txt-secondary">
                View your tribe, take attendance, and award camper points.
              </div>
            </div>
          </button>

          {/* Report Incident */}
          <button
            type="button"
            onClick={() => router.push("/volunteer/incidents")}
            className="group flex flex-col justify-between rounded-2xl border border-border-default bg-surface p-5 text-left transition-all duration-200 hover:border-neutral-700 hover:bg-surface-hover active:scale-[0.98] shadow-2xs"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 group-hover:scale-105 transition-transform">
              <ExclamationTriangleIcon className="h-7 w-7" />
            </div>
            <div className="mt-4">
              <div className="text-base font-extrabold text-txt-primary group-hover:text-amber-400 transition-colors">
                Report Incident
              </div>
              <div className="mt-0.5 text-xs text-txt-secondary">
                Log behavioral or safety incidents directly to camp supervisors.
              </div>
            </div>
          </button>

          {/* Dynamic Department Tool */}
          {category === "Medical" ? (
            <button
              type="button"
              onClick={() => router.push("/volunteer/medical")}
              className="group flex flex-col justify-between rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-left transition-all duration-200 hover:border-rose-500 hover:bg-rose-500/20 active:scale-[0.98] shadow-2xs"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500 text-white font-bold shadow-md group-hover:scale-105 transition-transform">
                <HeartIcon className="h-7 w-7" />
              </div>
              <div className="mt-4">
                <div className="text-base font-extrabold text-txt-primary group-hover:text-rose-400 transition-colors">
                  Medical Tools
                </div>
                <div className="mt-0.5 text-xs text-txt-secondary">
                  Log camper clinic visits, treatments & allergy notes.
                </div>
              </div>
            </button>
          ) : category === "Kitchen" ? (
            <button
              type="button"
              onClick={() => router.push("/volunteer/meals")}
              className="group flex flex-col justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-left transition-all duration-200 hover:border-amber-500 hover:bg-amber-500/20 active:scale-[0.98] shadow-2xs"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-white font-bold shadow-md group-hover:scale-105 transition-transform">
                <CakeIcon className="h-7 w-7" />
              </div>
              <div className="mt-4">
                <div className="text-base font-extrabold text-txt-primary group-hover:text-amber-400 transition-colors">
                  Meal Distribution
                </div>
                <div className="mt-0.5 text-xs text-txt-secondary">
                  Scan meal QR badges for breakfast, lunch & dinner service.
                </div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/volunteer/departments")}
              className="group flex flex-col justify-between rounded-2xl border border-border-default bg-surface p-5 text-left transition-all duration-200 hover:border-neutral-700 hover:bg-surface-hover active:scale-[0.98] shadow-2xs"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 group-hover:scale-105 transition-transform">
                <ShieldCheckIcon className="h-7 w-7" />
              </div>
              <div className="mt-4">
                <div className="text-base font-extrabold text-txt-primary group-hover:text-purple-400 transition-colors">
                  Departments
                </div>
                <div className="mt-0.5 text-xs text-txt-secondary">
                  Open your department, contacts, and reporting structure.
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 3. OPERATIONAL METRICS & ANNOUNCEMENTS */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Live Metrics */}
        <Card className="lg:col-span-1">
          <CardBody className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-txt-secondary">
              Camp Live Metrics
            </h3>
            <div className="rounded-xl border border-border-subtle bg-surface-raised p-4">
              <div className="text-xs font-semibold text-txt-secondary">Checked-in Campers</div>
              <div className="mt-1 text-3xl font-black text-emerald-400">{checkedInCount}</div>
              <div className="mt-1 text-xs text-txt-muted">Out of {totalCount} registered campers</div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface-raised p-4">
              <div className="text-xs font-semibold text-txt-secondary">Volunteer Category</div>
              <div className="mt-1 text-lg font-bold text-txt-primary">{category}</div>
            </div>
          </CardBody>
        </Card>

        {/* Announcements & Safety Bulletins */}
        <Card className="lg:col-span-2">
          <CardBody>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-txt-secondary">
                <MegaphoneIcon className="h-4 w-4 text-accent-500" />
                <span>Camp Announcements</span>
              </h3>
              <span className="text-xs text-txt-muted">{notifications.length} total</span>
            </div>

            <div className="space-y-3">
              {notifications.slice(0, 4).map((n: any) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-border-subtle bg-surface-raised p-3.5 transition-colors hover:border-neutral-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-txt-primary">{n.title}</span>
                    <span className="text-[10px] font-semibold text-accent-400">BroadCast</span>
                  </div>
                  <p className="mt-1 text-xs text-txt-secondary leading-relaxed">{n.body}</p>
                </div>
              ))}
              {notifications.length === 0 && (
                <div className="rounded-xl border border-border-subtle bg-surface-raised p-6 text-center text-xs text-txt-muted">
                  No new announcements broadcasted today.
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 4. EMERGENCY & HELP DESK SHORTCUTS */}
      <Card>
        <CardBody>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-txt-secondary">
            Emergency Contacts & Support Desk
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <PhoneIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-txt-primary">Camp Director</div>
                <div className="text-xs font-semibold text-emerald-400">+234 800 CAMPLY</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
                <HeartIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-txt-primary">Medical Tent</div>
                <div className="text-xs font-semibold text-rose-400">Ext. 102 (Clinic)</div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                <ExclamationTriangleIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-txt-primary">Security Desk</div>
                <div className="text-xs font-semibold text-amber-400">Ext. 101 (Security)</div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default function VolunteerDashboardPage() {
  const router = useRouter();
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  return (
    <AppShell area="volunteer">
      <PageHeader title="Volunteer Dashboard" />
      <StaffGate>{(profile) => <VolunteerDashboardContent profile={profile} />}</StaffGate>
    </AppShell>
  );
}
