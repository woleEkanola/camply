"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import {
  SparklesIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  QrCodeIcon,
  MapPinIcon,
  ShareIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

export default function CampusRepDashboard() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true });

  const managedCampuses: string[] = session?.user?.managedCampuses || [];
  const organizationId = session?.user?.organizationId ?? "";
  const campusId = managedCampuses[0];

  const { data: registrations = [] } = api.registration.getByOrganizationAndYear.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const { data: campus } = api.campus.getById.useQuery(
    { id: campusId },
    { enabled: !!campusId }
  );

  const { data: signupLinks, isLoading: isSignupLinksLoading } = api.signupLink.getByCampusAndCamp.useQuery(
    { campusId },
    { enabled: !!campusId }
  );

  const { data: statsData } = api.registration.getAdminListStats.useQuery(
    { organizationId, campusId },
    { enabled: !!organizationId && !!campusId }
  );

  const [copied, setCopied] = useState(false);

  const handleCopySignupLink = (token: string) => {
    const url = `${window.location.origin}/signup/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (status === "loading") {
    return (
      <AppShell area="campus-rep">
        <div className="flex h-screen items-center justify-center">Loading...</div>
      </AppShell>
    );
  }

  if (!session || managedCampuses.length === 0) {
    return (
      <AppShell area="campus-rep">
        <div className="p-8 text-center text-sm text-neutral-500">
          No managed campuses assigned to your account.
        </div>
      </AppShell>
    );
  }

  const campusName = campus?.name || "My Assigned Campus";
  const campusQuota = signupLinks?.quota ?? 0;
  const approvedCount = (statsData as any)?.countsByStatus?.APPROVED ?? 0;
  const pendingCount = (statsData as any)?.awaitingVetting ?? 0;
  const totalRegistrations = (statsData as any)?.totalCount ?? registrations.length ?? 0;
  const campersCount = new Set(registrations.map((reg: any) => reg.camperId)).size;

  const quotaPercent = campusQuota > 0 ? Math.min(100, Math.round((approvedCount / campusQuota) * 100)) : 100;

  return (
    <AppShell area="campus-rep">
      <PageHeader title="Campus Management Hub" />

      <div className="space-y-6">
        {/* 1. HERO CAMPUS HEADER & SHAREABLE SIGNUP LINK BOX */}
        <div className="relative overflow-hidden rounded-2xl border border-border-default bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-xs font-bold text-purple-400">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>CAMPUS REPRESENTATIVE</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-accent-500/15 border border-accent-500/30 px-2.5 py-0.5 text-xs font-semibold text-accent-400">
                  <MapPinIcon className="h-3.5 w-3.5" />
                  <span>{campusName}</span>
                </span>
              </div>
              <h2 className="text-2xl font-black text-txt-primary">
                {campusName} Overview
              </h2>
              <p className="text-xs text-txt-secondary">
                Manage registrations, share registration links, and recommend teenagers for admin approval.
              </p>
            </div>

            {/* Share Signup Link Tool */}
            <div className="w-full lg:w-96 rounded-xl border border-border-subtle bg-surface-raised p-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-txt-primary">
                <span className="flex items-center gap-1">
                  <ShareIcon className="h-3.5 w-3.5 text-accent-500" />
                  <span>Shareable Signup Link</span>
                </span>
                {signupLinks?.token && (
                  <span className="text-[10px] text-emerald-400 font-semibold">Active</span>
                )}
              </div>
              {isSignupLinksLoading ? (
                <div className="text-xs text-txt-muted">Loading signup URL...</div>
              ) : signupLinks ? (
                <div className="flex items-center gap-2">
                  <Input
                    containerClassName="flex-1"
                    className="text-xs font-mono"
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/signup/${signupLinks.token}`}
                    readOnly
                  />
                  <Button size="sm" onClick={() => handleCopySignupLink(signupLinks.token)}>
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-txt-muted">No active signup link generated.</div>
              )}
            </div>
          </div>

          {/* Quota Progress Meter */}
          {campusQuota > 0 && (
            <div className="mt-5 pt-4 border-t border-border-subtle">
              <div className="flex items-center justify-between text-xs font-bold text-txt-secondary mb-1.5">
                <span>Campus Approved Quota Usage</span>
                <span className="text-accent-400">{approvedCount} / {campusQuota} ({quotaPercent}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                <div
                  className="h-full bg-gradient-to-r from-accent-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 2. CORE ACTION CARDS GRID */}
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-txt-secondary">
            Quick Actions
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Review Registrations */}
            <button
              type="button"
              onClick={() => router.push("/campus-rep-dashboard/registrations")}
              className="group flex flex-col justify-between rounded-2xl border border-purple-500/30 bg-purple-500/10 p-5 text-left transition-all duration-200 hover:border-purple-500 hover:bg-purple-500/20 active:scale-[0.98] shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500 text-white font-bold shadow-md group-hover:scale-105 transition-transform">
                  <ClipboardDocumentListIcon className="h-7 w-7" />
                </div>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-black text-amber-400">
                    {pendingCount} Pending
                  </span>
                )}
              </div>
              <div className="mt-4">
                <div className="text-base font-extrabold text-txt-primary group-hover:text-purple-400 transition-colors flex items-center justify-between">
                  <span>Review Registrations</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </div>
                <div className="mt-0.5 text-xs text-txt-secondary">
                  Vet teenager applications and recommend them to admins.
                </div>
              </div>
            </button>

            {/* Campus Campers Roster */}
            <button
              type="button"
              onClick={() => router.push("/campus-rep-dashboard/campers-profile")}
              className="group flex flex-col justify-between rounded-2xl border border-border-default bg-surface p-5 text-left transition-all duration-200 hover:border-neutral-700 hover:bg-surface-hover active:scale-[0.98] shadow-2xs"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30 group-hover:scale-105 transition-transform">
                <UserGroupIcon className="h-7 w-7" />
              </div>
              <div className="mt-4">
                <div className="text-base font-extrabold text-txt-primary group-hover:text-sky-400 transition-colors flex items-center justify-between">
                  <span>Campus Campers</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </div>
                <div className="mt-0.5 text-xs text-txt-secondary">
                  View profiles of registered teenagers for your campus.
                </div>
              </div>
            </button>

            {/* QR Scanner */}
            <button
              type="button"
              onClick={() => router.push("/teacher/qr-scan")}
              className="group flex flex-col justify-between rounded-2xl border border-border-default bg-surface p-5 text-left transition-all duration-200 hover:border-neutral-700 hover:bg-surface-hover active:scale-[0.98] shadow-2xs"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500/15 text-accent-400 border border-accent-500/30 group-hover:scale-105 transition-transform">
                <QrCodeIcon className="h-7 w-7" />
              </div>
              <div className="mt-4">
                <div className="text-base font-extrabold text-txt-primary group-hover:text-accent-400 transition-colors flex items-center justify-between">
                  <span>QR Station Scanner</span>
                  <ArrowRightIcon className="h-4 w-4" />
                </div>
                <div className="mt-0.5 text-xs text-txt-secondary">
                  Scan teenager badges for check-in & station validation.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* 3. CAMPUS METRICS STATS */}
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-txt-secondary">
            Campus Operational Metrics
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Campers" value={campersCount} />
            <StatCard label="Total Registrations" value={totalRegistrations} />
            <StatCard label="Pending Vetting" value={pendingCount} />
            <StatCard label="Approved Campers" value={approvedCount} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
