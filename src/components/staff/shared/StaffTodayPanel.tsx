"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import {
  QrCodeIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  PhoneIcon,
  MegaphoneIcon,
  SparklesIcon,
  BuildingOffice2Icon,
  AcademicCapIcon,
  HeartIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";

export function StaffTodayPanel({
  organizationId,
  campId,
  profile,
  section = "all",
}: {
  organizationId: string;
  campId?: string;
  profile?: any;
  section?: "all" | "hero" | "operations";
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const managedCampuses: string[] = (session?.user as any)?.managedCampuses || [];
  const isCampusRep = managedCampuses.length > 0;

  const { data: summary } = api.attendance.todaySummary.useQuery(
    { organizationId, campId: campId ?? "" },
    { enabled: !!organizationId && !!campId }
  );
  const { data: notifications = [] } = api.notification.listMine.useQuery(undefined, { enabled: true });

  const tribeName = profile?.assignedTribe?.name || "Tribe Unassigned";
  const hostelName = profile?.assignedHostel?.name || profile?.assignedRoom?.name || "Hostel Unassigned";
  const venueName = profile?.assignedVenue?.name || profile?.campus?.name || "Main Camp Venue";
  const camperCount = profile?.camperAssignments?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. HERO PROFILE & ASSIGNMENT BANNER */}
      {section !== "operations" && <div className="relative overflow-hidden rounded-2xl border border-border-default bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-500/15 border border-accent-500/30 px-2.5 py-0.5 text-xs font-bold text-accent-400">
                <AcademicCapIcon className="h-3.5 w-3.5" />
                <span>TEACHER</span>
              </span>
              {isCampusRep && (
                <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-xs font-bold text-purple-400">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>CAMPUS REP</span>
                </span>
              )}
              <span className="inline-flex items-center rounded-md bg-sky-500/15 border border-sky-500/30 px-2.5 py-0.5 text-xs font-semibold text-sky-400">
                {tribeName}
              </span>
            </div>
            <h2 className="text-2xl font-black text-txt-primary">
              Welcome back, {profile?.firstName || "Teacher"}! 👋
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-txt-secondary">
              <span className="flex items-center gap-1">
                <BuildingOffice2Icon className="h-4 w-4 text-accent-500 shrink-0" />
                <span>Hostel: <strong className="text-txt-primary font-bold">{hostelName}</strong></span>
              </span>
              <span className="flex items-center gap-1">
                <MapPinIcon className="h-4 w-4 text-accent-500 shrink-0" />
                <span>Venue: <strong className="text-txt-primary font-bold">{venueName}</strong></span>
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <UserGroupIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-txt-muted uppercase tracking-wider">Assigned Campers</div>
              <div className="text-lg font-black text-txt-primary">{camperCount} Teenagers</div>
            </div>
          </div>
        </div>
      </div>}

      {/* 2. CORE OPERATIONAL QUICK ACTIONS GRID */}
      {section !== "hero" && <><div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-txt-secondary">
          Core Operational Tools
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* QR Scanner */}
          <button
            type="button"
            onClick={() => router.push("/teacher/qr-scan")}
            className="group flex flex-col justify-between rounded-2xl border border-accent-500/40 bg-accent-500/10 p-5 text-left transition-all duration-200 hover:border-accent-500 hover:bg-accent-500/20 active:scale-[0.98] shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500 text-white font-bold shadow-md group-hover:scale-105 transition-transform">
                <QrCodeIcon className="h-7 w-7" />
              </div>
              <span className="rounded-full bg-accent-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-accent-300">
                Primary
              </span>
            </div>
            <div className="mt-4">
              <div className="text-base font-extrabold text-txt-primary group-hover:text-accent-400 transition-colors">
                QR Code Scanner
              </div>
              <div className="mt-0.5 text-xs text-txt-secondary">
                Scan camper badges for check-in, attendance & validation.
              </div>
            </div>
          </button>

          {/* Take Attendance */}
          <button
            type="button"
            onClick={() => router.push("/teacher/attendance")}
            className="group flex flex-col justify-between rounded-2xl border border-border-default bg-surface p-5 text-left transition-all duration-200 hover:border-neutral-700 hover:bg-surface-hover active:scale-[0.98] shadow-2xs"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform">
              <ClipboardDocumentCheckIcon className="h-7 w-7" />
            </div>
            <div className="mt-4">
              <div className="text-base font-extrabold text-txt-primary group-hover:text-emerald-400 transition-colors">
                Take Attendance
              </div>
              <div className="mt-0.5 text-xs text-txt-secondary">
                Take daily roll call & track present campers in your tribe.
              </div>
            </div>
          </button>

          {/* My Tribe & Campers */}
          <button
            type="button"
            onClick={() => router.push("/teacher/campers")}
            className="group flex flex-col justify-between rounded-2xl border border-border-default bg-surface p-5 text-left transition-all duration-200 hover:border-neutral-700 hover:bg-surface-hover active:scale-[0.98] shadow-2xs"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30 group-hover:scale-105 transition-transform">
              <UserGroupIcon className="h-7 w-7" />
            </div>
            <div className="mt-4">
              <div className="text-base font-extrabold text-txt-primary group-hover:text-sky-400 transition-colors">
                My Tribe Roster
              </div>
              <div className="mt-0.5 text-xs text-txt-secondary">
                View assigned campers, edit photos & tribe allocations.
              </div>
            </div>
          </button>

          {/* Dual-Role Campus Rep action or Incident Report */}
          {isCampusRep ? (
            <button
              type="button"
              onClick={() => router.push("/teacher/registrations")}
              className="group flex flex-col justify-between rounded-2xl border border-purple-500/30 bg-purple-500/10 p-5 text-left transition-all duration-200 hover:border-purple-500 hover:bg-purple-500/20 active:scale-[0.98] shadow-2xs"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500 text-white font-bold shadow-md group-hover:scale-105 transition-transform">
                <ClipboardDocumentListIcon className="h-7 w-7" />
              </div>
              <div className="mt-4">
                <div className="text-base font-extrabold text-txt-primary group-hover:text-purple-400 transition-colors">
                  Campus Registrations
                </div>
                <div className="mt-0.5 text-xs text-txt-secondary">
                  Review & recommend campus registrations for admin approval.
                </div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/teacher/incidents")}
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
          )}
        </div>
      </div>

      {/* 3. OPERATIONAL METRICS & ANNOUNCEMENTS */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Attendance Summary */}
        <Card className="lg:col-span-1">
          <CardBody className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-txt-secondary">
              Today's Attendance
            </h3>
            <div className="rounded-xl border border-border-subtle bg-surface-raised p-4">
              <div className="text-xs font-semibold text-txt-secondary">Present Campers</div>
              <div className="mt-1 text-3xl font-black text-emerald-400">{summary?.present ?? 0}</div>
              <div className="mt-1 text-xs text-txt-muted">Out of {summary?.total ?? 0} expected today</div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface-raised p-4">
              <div className="text-xs font-semibold text-txt-secondary">Assigned Tribe</div>
              <div className="mt-1 text-lg font-bold text-txt-primary">{tribeName}</div>
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

      {/* 4. EMERGENCY CONTACTS & SUPPORT DESK */}
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
      </Card></>}
    </div>
  );
}
