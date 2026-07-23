"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  UsersIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  ClipboardDocumentListIcon,
  CalendarIcon,
  CheckCircleIcon,
  UserPlusIcon,
  MegaphoneIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function avatarTone(name: string): string {
  const tones = [
    "bg-purple-100 text-purple-700",
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-orange-100 text-orange-700",
    "bg-rose-100 text-rose-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return tones[Math.abs(hash) % tones.length];
}

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "REQUIRES_ACTION":
      return "attention";
    case "PENDING":
      return "warning";
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    case "CHECKED_IN":
      return "info";
    default:
      return "neutral";
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function formatDateRange(start: string | Date, end: string | Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(start).toLocaleDateString("en-US", opts);
  const e = new Date(end).toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${s} \u2013 ${e}`;
}

interface ExtendedUser {
  id: string;
  role: string;
  organizationId?: string;
  name?: string | null;
}

export default function AnalyticsDashboard() {
  const { data: session } = useSession();
  const organizationId = (session?.user as ExtendedUser | undefined)?.organizationId;

  const { data: userProfile } = api.user.getProfile.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );

  const { data: usersData, isLoading: usersLoading } = api.user.getParentsWithCamperCounts.useQuery({});
  const { data: adminsData, isLoading: adminsLoading } = api.admin.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );
  const { data: campersData, isLoading: campersLoading } = api.camper.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );
  const { data: campusesData, isLoading: campusesLoading } = api.campus.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );
  const { data: campsData } = api.camp.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );

  const { data: regStats } = api.registration.getAdminListStats.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );

  const { data: recentRegistrations, isLoading: regLoading } = api.registration.adminList.useQuery(
    { organizationId: organizationId!, limit: 5 },
    { enabled: !!organizationId }
  );

  const { data: teacherStats } = api.staff.stats.useQuery(
    { organizationId: organizationId!, campId: activeCamp?.id!, type: "TEACHER" },
    { enabled: !!activeCamp?.id }
  );

  const { data: volunteerStats } = api.staff.stats.useQuery(
    { organizationId: organizationId!, campId: activeCamp?.id!, type: "VOLUNTEER" },
    { enabled: !!activeCamp?.id }
  );

  const firstName = userProfile?.firstName;
  const regItems = recentRegistrations?.items ?? [];

  return (
    <div className="w-full space-y-8">
      {/* ─── Section 1: Header ─── */}
      <PageHeader
        title={`${greeting()}, ${firstName ?? "there"} \u{1F44B}`}
        description="Here's what's happening in your organization today."
        actions={
          activeCamp ? (
            <div className="shrink-0 rounded-xl border border-border-default bg-surface p-4 shadow-xs sm:min-w-[240px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-txt-muted">Active Camp</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-txt-primary">{activeCamp.name}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-txt-secondary">
                <CalendarIcon className="h-3.5 w-3.5 text-txt-muted" />
                {formatDateRange(activeCamp.startDate, activeCamp.endDate)}
              </div>
            </div>
          ) : undefined
        }
        className="flex-col gap-4 sm:flex-row sm:items-start"
      />

      {/* ─── Section 2: Organization Overview Stats ─── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link
          href="/admin/users"
          data-testid="stat-card-parents"
          className="group rounded-xl border border-border-default bg-surface p-5 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <UsersIcon className="h-5 w-5" />
          </div>
          <p className="text-sm text-txt-secondary">Parents</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-txt-primary">
            {usersLoading ? "\u2026" : usersData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-txt-muted">Total parents</p>
        </Link>

        <Link
          href="/admin/access-control"
          data-testid="stat-card-admins"
          className="group rounded-xl border border-border-default bg-surface p-5 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <ShieldCheckIcon className="h-5 w-5" />
          </div>
          <p className="text-sm text-txt-secondary">Admins</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-txt-primary">
            {adminsLoading ? "\u2026" : adminsData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-txt-muted">Total admins</p>
        </Link>

        <Link
          href="/admin/campers"
          data-testid="stat-card-campers"
          className="group rounded-xl border border-border-default bg-surface p-5 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <UserGroupIcon className="h-5 w-5" />
          </div>
          <p className="text-sm text-txt-secondary">Campers</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-txt-primary">
            {campersLoading ? "\u2026" : campersData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-txt-muted">Total campers</p>
        </Link>

        <Link
          href="/admin/campuses"
          data-testid="stat-card-campuses"
          className="group rounded-xl border border-border-default bg-surface p-5 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <BuildingOffice2Icon className="h-5 w-5" />
          </div>
          <p className="text-sm text-txt-secondary">Campuses</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-txt-primary">
            {campusesLoading ? "\u2026" : campusesData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-txt-muted">Total campuses</p>
        </Link>
      </div>

      {/* ─── Section 3: Quick Actions ─── */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-txt-primary">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Link
            href="/admin/registrations"
            data-testid="quick-action-registrations"
            className="group flex min-h-[120px] flex-col rounded-xl border border-border-default bg-surface p-4 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ClipboardDocumentListIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-txt-primary">
              Review
              <br />
              Registrations
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-txt-muted transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/check-in"
            data-testid="quick-action-checkin"
            className="group flex min-h-[120px] flex-col rounded-xl border border-border-default bg-surface p-4 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircleIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-txt-primary">
              Check-in
              <br />
              Campers
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-txt-muted transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/campers"
            data-testid="quick-action-add-camper"
            className="group flex min-h-[120px] flex-col rounded-xl border border-border-default bg-surface p-4 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <UserPlusIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-txt-primary">
              Add
              <br />
              Camper
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-txt-muted transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/communication"
            data-testid="quick-action-communication"
            className="group flex min-h-[120px] flex-col rounded-xl border border-border-default bg-surface p-4 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <MegaphoneIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-txt-primary">
              Send
              <br />
              Email / SMS
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-txt-muted transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/campuses"
            data-testid="quick-action-campuses"
            className="group flex min-h-[120px] flex-col rounded-xl border border-border-default bg-surface p-4 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <BuildingOffice2Icon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-txt-primary">
              Manage
              <br />
              Campuses
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-txt-muted transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>
        </div>
      </div>

      {/* ─── Section 4: Today's Summary ─── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-txt-primary">Today&apos;s Summary</h2>
          <Link
            href="/admin/registrations"
            className="inline-flex items-center gap-1 text-sm font-medium text-txt-secondary hover:text-txt-primary"
          >
            View all activity
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Link
            href="/admin/registrations?status=PENDING"
            className="group rounded-xl border border-border-default bg-surface p-5 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ClipboardDocumentListIcon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-extrabold tracking-tight text-txt-primary">
              {regStats?.countsByStatus?.PENDING ?? 0}
            </p>
            <p className="mt-0.5 text-sm font-medium text-txt-secondary">Pending Reviews</p>
            <p className="mt-0.5 text-xs text-txt-muted">Registrations waiting for approval</p>
            <div className="mt-3 flex items-center gap-1">
              <ArrowRightIcon className="h-4 w-4 text-txt-muted transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/registrations?status=REQUIRES_ACTION"
            className="group rounded-xl border border-border-default bg-surface p-5 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <ExclamationTriangleIcon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-extrabold tracking-tight text-txt-primary">
              {regStats?.countsByStatus?.REQUIRES_ACTION ?? 0}
            </p>
            <p className="mt-0.5 text-sm font-medium text-txt-secondary">Requires Action</p>
            <p className="mt-0.5 text-xs text-txt-muted">Corrections requested from parents</p>
            <div className="mt-3 flex items-center gap-1">
              <ArrowRightIcon className="h-4 w-4 text-txt-muted transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/registrations?reviewState=AWAITING_FINAL"
            className="group rounded-xl border border-border-default bg-surface p-5 shadow-xs transition hover:border-neutral-700 hover:bg-surface-hover"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <ClockIcon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-extrabold tracking-tight text-txt-primary">
              {regStats?.awaitingFinal ?? 0}
            </p>
            <p className="mt-0.5 text-sm font-medium text-txt-secondary">Awaiting Final</p>
            <p className="mt-0.5 text-xs text-txt-muted">Endorsed, awaiting final approval</p>
            <div className="mt-3 flex items-center gap-1">
              <ArrowRightIcon className="h-4 w-4 text-txt-muted transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>
        </div>
      </div>

      {/* ─── Section 5: Recent Registrations + Organization Overview ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* 5a. Recent Registrations */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-border-default bg-surface shadow-xs">
            <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
              <h2 className="text-base font-semibold text-txt-primary">Recent Registrations</h2>
              <Link
                href="/admin/registrations"
                className="inline-flex items-center gap-1 text-sm font-medium text-txt-secondary hover:text-txt-primary"
              >
                View all
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>

            {regLoading ? (
              <div className="divide-y divide-border-subtle">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-raised" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3.5 w-32 animate-pulse rounded bg-surface-raised" />
                      <div className="h-3 w-24 animate-pulse rounded bg-surface-raised" />
                    </div>
                    <div className="h-5 w-20 animate-pulse rounded-full bg-surface-raised" />
                    <div className="h-3 w-10 animate-pulse rounded bg-surface-raised" />
                  </div>
                ))}
              </div>
            ) : regItems.length === 0 ? (
              <EmptyState
                title="No registrations yet"
                description="Registrations will appear here as parents sign up."
                className="border-0 py-10"
              />
            ) : (
              <>
                <div className="divide-y divide-border-subtle">
                  {regItems.map((reg) => (
                    <Link
                      key={reg.id}
                      href="/admin/registrations"
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-hover"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(reg.camper?.name ?? "")}`}
                      >
                        {initials(reg.camper?.name ?? "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-txt-primary">
                          {reg.camper?.name ?? "\u2014"}
                        </p>
                        <p className="truncate text-xs text-txt-muted">
                          {reg.campus?.name ?? "\u2014"}
                        </p>
                      </div>
                      <Badge
                        tone={statusTone(reg.status)}
                        className="shrink-0 uppercase tracking-wide"
                      >
                        {statusLabel(reg.status)}
                      </Badge>
                      <span className="shrink-0 text-xs text-txt-muted">
                        {timeAgo(reg.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
                <Link
                  href="/admin/registrations"
                  className="flex items-center justify-center gap-2 border-t border-border-default px-5 py-3 text-sm font-medium text-txt-secondary transition hover:bg-surface-hover"
                >
                  View all registrations
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        </div>

        {/* 5b. Organization Overview */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border-default bg-surface shadow-xs">
            <div className="border-b border-border-default px-5 py-4">
              <h2 className="text-base font-semibold text-txt-primary">Organization Overview</h2>
            </div>
            <div className="divide-y divide-border-subtle">
              <Link
                href="/admin/users"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-hover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <UsersIcon className="h-4 w-4" />
                </div>
                <span className="text-sm text-txt-secondary">Parents</span>
                <span className="ml-auto text-sm font-semibold text-txt-primary">
                  {usersLoading ? "\u2026" : usersData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-txt-muted" />
              </Link>

              <Link
                href="/admin/campers"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-hover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <UserGroupIcon className="h-4 w-4" />
                </div>
                <span className="text-sm text-txt-secondary">Campers</span>
                <span className="ml-auto text-sm font-semibold text-txt-primary">
                  {campersLoading ? "\u2026" : campersData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
              </Link>

              <Link
                href="/admin/access-control"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-hover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <ShieldCheckIcon className="h-4 w-4" />
                </div>
                <span className="text-sm text-txt-secondary">Admins</span>
                <span className="ml-auto text-sm font-semibold text-txt-primary">
                  {adminsLoading ? "\u2026" : adminsData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-txt-muted" />
              </Link>

              <Link
                href="/admin/campuses"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-hover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  <BuildingOffice2Icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-txt-secondary">Campuses</span>
                <span className="ml-auto text-sm font-semibold text-txt-primary">
                  {campusesLoading ? "\u2026" : campusesData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-txt-muted" />
              </Link>

              <Link
                href="/admin/camps"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-hover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <CalendarIcon className="h-4 w-4" />
                </div>
                <span className="text-sm text-txt-secondary">Camps</span>
                <span className="ml-auto text-sm font-semibold text-txt-primary">
                  {campsData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-txt-muted" />
              </Link>

              {activeCamp && teacherStats !== undefined && (
                <Link
                  href="/admin/teachers"
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-hover"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <ShieldCheckIcon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-txt-secondary">Teachers</span>
                  <span className="ml-auto text-sm font-semibold text-txt-primary">
                    {teacherStats?.total ?? "\u2026"}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-txt-muted" />
                </Link>
              )}

              {activeCamp && volunteerStats !== undefined && (
                <Link
                  href="/admin/volunteers"
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-hover"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                    <ShieldCheckIcon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-txt-secondary">Volunteers</span>
                  <span className="ml-auto text-sm font-semibold text-txt-primary">
                    {volunteerStats?.total ?? "\u2026"}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-txt-muted" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section 6: Footer ─── */}
      <p className="pt-2 text-center text-sm text-txt-muted">
        {"\u2600\uFE0F"} You&apos;re all caught up! Keep up the great work.
      </p>
    </div>
  );
}
