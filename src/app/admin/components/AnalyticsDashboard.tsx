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
            <div className="shrink-0 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:min-w-[240px]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">Active Camp</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold text-neutral-900">{activeCamp.name}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
                <CalendarIcon className="h-3.5 w-3.5 text-neutral-400" />
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
          className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <UsersIcon className="h-5 w-5" />
          </div>
          <p className="text-sm text-neutral-500">Parents</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            {usersLoading ? "\u2026" : usersData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-neutral-400">Total parents</p>
        </Link>

        <Link
          href="/admin/access-control"
          data-testid="stat-card-admins"
          className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <ShieldCheckIcon className="h-5 w-5" />
          </div>
          <p className="text-sm text-neutral-500">Admins</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            {adminsLoading ? "\u2026" : adminsData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-neutral-400">Total admins</p>
        </Link>

        <Link
          href="/admin/campers"
          data-testid="stat-card-campers"
          className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <UserGroupIcon className="h-5 w-5" />
          </div>
          <p className="text-sm text-neutral-500">Campers</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            {campersLoading ? "\u2026" : campersData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-neutral-400">Total campers</p>
        </Link>

        <Link
          href="/admin/campuses"
          data-testid="stat-card-campuses"
          className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <BuildingOffice2Icon className="h-5 w-5" />
          </div>
          <p className="text-sm text-neutral-500">Campuses</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            {campusesLoading ? "\u2026" : campusesData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-neutral-400">Total campuses</p>
        </Link>
      </div>

      {/* ─── Section 3: Quick Actions ─── */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Link
            href="/admin/registrations"
            data-testid="quick-action-registrations"
            className="group flex min-h-[120px] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <ClipboardDocumentListIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-neutral-900">
              Review
              <br />
              Registrations
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/check-in"
            data-testid="quick-action-checkin"
            className="group flex min-h-[120px] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircleIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-neutral-900">
              Check-in
              <br />
              Campers
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/campers"
            data-testid="quick-action-add-camper"
            className="group flex min-h-[120px] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <UserPlusIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-neutral-900">
              Add
              <br />
              Camper
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/communication"
            data-testid="quick-action-communication"
            className="group flex min-h-[120px] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <MegaphoneIcon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-neutral-900">
              Send
              <br />
              Email / SMS
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/campuses"
            data-testid="quick-action-campuses"
            className="group flex min-h-[120px] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <BuildingOffice2Icon className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold leading-tight text-neutral-900">
              Manage
              <br />
              Campuses
            </p>
            <div className="mt-auto flex items-center gap-1 pt-3">
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>
        </div>
      </div>

      {/* ─── Section 4: Today's Summary ─── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Today&apos;s Summary</h2>
          <Link
            href="/admin/registrations"
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700"
          >
            View all activity
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Link
            href="/admin/registrations?status=PENDING"
            className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <ClipboardDocumentListIcon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-neutral-900">
              {regStats?.countsByStatus?.PENDING ?? 0}
            </p>
            <p className="mt-0.5 text-sm font-medium text-neutral-700">Pending Reviews</p>
            <p className="mt-0.5 text-xs text-neutral-400">Registrations waiting for approval</p>
            <div className="mt-3 flex items-center gap-1">
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/registrations?status=REQUIRES_ACTION"
            className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <ExclamationTriangleIcon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-neutral-900">
              {regStats?.countsByStatus?.REQUIRES_ACTION ?? 0}
            </p>
            <p className="mt-0.5 text-sm font-medium text-neutral-700">Requires Action</p>
            <p className="mt-0.5 text-xs text-neutral-400">Corrections requested from parents</p>
            <div className="mt-3 flex items-center gap-1">
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>

          <Link
            href="/admin/registrations?reviewState=AWAITING_FINAL"
            className="group rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <ClockIcon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold tracking-tight text-neutral-900">
              {regStats?.awaitingFinal ?? 0}
            </p>
            <p className="mt-0.5 text-sm font-medium text-neutral-700">Awaiting Final</p>
            <p className="mt-0.5 text-xs text-neutral-400">Endorsed, awaiting final approval</p>
            <div className="mt-3 flex items-center gap-1">
              <ArrowRightIcon className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-accent-500" />
            </div>
          </Link>
        </div>
      </div>

      {/* ─── Section 5: Recent Registrations + Organization Overview ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* 5a. Recent Registrations */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
              <h2 className="text-base font-semibold text-neutral-900">Recent Registrations</h2>
              <Link
                href="/admin/registrations"
                className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-700"
              >
                View all
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>

            {regLoading ? (
              <div className="divide-y divide-neutral-100">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-neutral-100" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3.5 w-32 animate-pulse rounded bg-neutral-100" />
                      <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
                    </div>
                    <div className="h-5 w-20 animate-pulse rounded-full bg-neutral-100" />
                    <div className="h-3 w-10 animate-pulse rounded bg-neutral-100" />
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
                <div className="divide-y divide-neutral-100">
                  {regItems.map((reg) => (
                    <Link
                      key={reg.id}
                      href="/admin/registrations"
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-neutral-50"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(reg.camper?.name ?? "")}`}
                      >
                        {initials(reg.camper?.name ?? "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {reg.camper?.name ?? "\u2014"}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {reg.campus?.name ?? "\u2014"}
                        </p>
                      </div>
                      <Badge
                        tone={statusTone(reg.status)}
                        className="shrink-0 uppercase tracking-wide"
                      >
                        {statusLabel(reg.status)}
                      </Badge>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {timeAgo(reg.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
                <Link
                  href="/admin/registrations"
                  className="flex items-center justify-center gap-2 border-t border-neutral-100 px-5 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
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
          <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-100 px-5 py-4">
              <h2 className="text-base font-semibold text-neutral-900">Organization Overview</h2>
            </div>
            <div className="divide-y divide-neutral-100">
              <Link
                href="/admin/users"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-neutral-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <UsersIcon className="h-4 w-4" />
                </div>
                <span className="text-sm text-neutral-700">Parents</span>
                <span className="ml-auto text-sm font-semibold text-neutral-900">
                  {usersLoading ? "\u2026" : usersData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
              </Link>

              <Link
                href="/admin/campers"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-neutral-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <UserGroupIcon className="h-4 w-4" />
                </div>
                <span className="text-sm text-neutral-700">Campers</span>
                <span className="ml-auto text-sm font-semibold text-neutral-900">
                  {campersLoading ? "\u2026" : campersData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
              </Link>

              <Link
                href="/admin/access-control"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-neutral-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <ShieldCheckIcon className="h-4 w-4" />
                </div>
                <span className="text-sm text-neutral-700">Admins</span>
                <span className="ml-auto text-sm font-semibold text-neutral-900">
                  {adminsLoading ? "\u2026" : adminsData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
              </Link>

              <Link
                href="/admin/campuses"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-neutral-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <BuildingOffice2Icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-neutral-700">Campuses</span>
                <span className="ml-auto text-sm font-semibold text-neutral-900">
                  {campusesLoading ? "\u2026" : campusesData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
              </Link>

              <Link
                href="/admin/camps"
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-neutral-50"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <CalendarIcon className="h-4 w-4" />
                </div>
                <span className="text-sm text-neutral-700">Camps</span>
                <span className="ml-auto text-sm font-semibold text-neutral-900">
                  {campsData?.length ?? 0}
                </span>
                <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
              </Link>

              {activeCamp && teacherStats !== undefined && (
                <Link
                  href="/admin/teachers"
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-neutral-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <ShieldCheckIcon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-neutral-700">Teachers</span>
                  <span className="ml-auto text-sm font-semibold text-neutral-900">
                    {teacherStats?.total ?? "\u2026"}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
                </Link>
              )}

              {activeCamp && volunteerStats !== undefined && (
                <Link
                  href="/admin/volunteers"
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-neutral-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <ShieldCheckIcon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-neutral-700">Volunteers</span>
                  <span className="ml-auto text-sm font-semibold text-neutral-900">
                    {volunteerStats?.total ?? "\u2026"}
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-neutral-300" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section 6: Footer ─── */}
      <p className="pt-2 text-center text-sm text-neutral-400">
        {"\u2600\uFE0F"} You&apos;re all caught up! Keep up the great work.
      </p>
    </div>
  );
}
