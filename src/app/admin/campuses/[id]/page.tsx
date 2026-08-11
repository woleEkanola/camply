"use client";

import { useParams, useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import AppShell from "@/components/layout/AppShell";
import React, { useState, useEffect } from "react";
import StatCard from "../../components/StatCard";
import LineChart from "../../components/LineChart";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Dialog } from "@/components/ui/Dialog";
import type { SignupLink } from "@/types/signupLink";
import {
  ChevronLeftIcon,
  EllipsisVerticalIcon,
  MapPinIcon,
  LinkIcon,
  ChartBarIcon,
  UserGroupIcon,
  PencilIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
  PlusIcon,
  BuildingOffice2Icon,
  NoSymbolIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

const CampusDetailsPage = () => {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const [activeTab, setActiveTab] = useState<"overview" | "representatives" | "registrations" | "settings">("overview");
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [quotaFormData, setQuotaFormData] = useState<{ quota: number; quotaFullBehavior: "CLOSE" | "WAITLIST" }>({
    quota: 0,
    quotaFullBehavior: "CLOSE",
  });
  const [accentColor, setAccentColor] = useState("#9333ea");
  const [quotaError, setQuotaError] = useState("");
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  useEffect(() => {
    if (typeof document !== "undefined") {
      const color = getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim();
      if (color) setAccentColor(color);
    }
  }, []);


  const { data: campus, isLoading, error, refetch: refetchCampus } = api.campus.getById.useQuery(
    { id },
    { enabled: !!id }
  );

  const { data: stats, refetch: refetchStats } = api.campus.getStats.useQuery(
    { campusId: id },
    { enabled: !!id }
  );

  const deleteCampusMutation = api.campus.delete.useMutation({
    onSuccess: () => {
      router.push("/admin/campuses");
    },
  });

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId: (campus as any)?.organizationId || "" },
    { enabled: !!campus }
  );

  const { data: signupLinks = [] } = api.signupLink.getByOrganization.useQuery(
    {
      organizationId: (campus as any)?.organizationId || "",
      campId: (activeCamp as any)?.id,
    },
    { enabled: !!campus && !!(activeCamp as any)?.id }
  );

  const signupLink: SignupLink | undefined = (signupLinks as SignupLink[]).find(
    (link: SignupLink) => link.campusId === id
  );

  const updateQuotaMutation = api.signupLink.updateQuota.useMutation({
    onSuccess: () => {
      setIsQuotaModalOpen(false);
      void refetchStats();
    },
    onError: (err) => {
      setQuotaError(err.message);
    },
  });

  const utils = api.useUtils();
  const deactivateLinkMutation = api.signupLink.deactivate.useMutation({
    onSuccess: () => void utils.signupLink.getByOrganization.invalidate(),
  });
  const reactivateLinkMutation = api.signupLink.reactivate.useMutation({
    onSuccess: () => void utils.signupLink.getByOrganization.invalidate(),
  });
  const isTogglingLink = deactivateLinkMutation.isPending || reactivateLinkMutation.isPending;

  const handleToggleSignupLink = () => {
    if (!signupLink) return;
    if (signupLink.active) {
      deactivateLinkMutation.mutate({ id: signupLink.id });
    } else {
      reactivateLinkMutation.mutate({ id: signupLink.id });
    }
  };

  const suspendCampusMutation = api.campus.suspend.useMutation({
    onSuccess: () => {
      setIsSuspendModalOpen(false);
      setSuspendReason("");
      void refetchCampus();
    },
  });
  const unsuspendCampusMutation = api.campus.unsuspend.useMutation({
    onSuccess: () => void refetchCampus(),
  });
  const isTogglingSuspension = suspendCampusMutation.isPending || unsuspendCampusMutation.isPending;

  const handleConfirmSuspend = () => {
    if (!campus) return;
    suspendCampusMutation.mutate({ id: campus.id, reason: suspendReason.trim() || undefined });
  };
  const handleUnsuspend = () => {
    if (!campus) return;
    unsuspendCampusMutation.mutate({ id: campus.id });
  };

  if (isLoading) {
    return (
      <AppShell area="admin">
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" />
        </div>
      </AppShell>
    );
  }

  if (error || !campus) {
    return (
      <AppShell area="admin">
        <div className="p-8 text-center text-danger-600">
          <p className="font-semibold">Error loading campus details.</p>
          <Button onClick={() => router.push("/admin/campuses")} className="mt-4">
            Back to Campuses
          </Button>
        </div>
      </AppShell>
    );
  }

  const tabOptions = [
    { id: "overview", label: "Overview" },
    { id: "representatives", label: "Representatives" },
    { id: "registrations", label: "Registrations" },
    { id: "settings", label: "Settings" },
  ];

  const formattedAddress = [campus.address, campus.city, campus.state, campus.country]
    .filter(Boolean)
    .join(", ");

  const signupUrl = typeof window !== "undefined" ? `${window.location.origin}/signup/${campus.campusCode || campus.slug}` : "";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(signupUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleOpenQuotaModal = () => {
    if (!signupLink) return;
    setQuotaError("");
    setQuotaFormData({
      quota: signupLink.quota ?? 0,
      quotaFullBehavior: (signupLink.quotaFullBehavior as "CLOSE" | "WAITLIST") ?? "CLOSE",
    });
    setIsQuotaModalOpen(true);
  };

  const handleSaveQuota = () => {
    if (!signupLink) return;
    updateQuotaMutation.mutate({
      id: signupLink.id,
      quota: quotaFormData.quota,
      quotaFullBehavior: quotaFormData.quotaFullBehavior,
    });
  };

  const repsList = Array.isArray((campus as any).reps) ? (campus as any).reps : [];

  return (
    <AppShell area="admin">
      <div className="max-w-xl mx-auto space-y-5 pb-12">
        {/* TOP BAR NAV */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => router.push("/admin/campuses")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-txt-secondary border border-border-default/80 hover:bg-surface-hover transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5 stroke-[2.5]" />
          </button>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-txt-secondary border border-border-default/80 hover:bg-surface-hover transition-colors"
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </button>
        </div>

        {/* CAMPUS IDENTITY EMBLEM & TITLE */}
        <div className="space-y-3 pt-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-100/70 text-accent-700 shadow-2xs">
            <BuildingOffice2Icon className="h-8 w-8" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-txt-primary">{campus.name}</h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  !campus.suspended ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}
              >
                • {!campus.suspended ? "Active" : "Suspended"}
              </span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-txt-secondary">
              {campus.campusCode ? `${campus.campusCode}` : "No Code"}
              <span className="mx-1.5 text-txt-muted">•</span>
              Order #{campus.displayOrder ?? 0}
            </p>
          </div>
        </div>

        {/* UNDERLINE TABS */}
        <div className="border-b border-border-default/80">
          <nav className="flex space-x-6" role="tablist">
            {tabOptions.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? "border-accent-600 text-accent-700 font-bold"
                    : "border-transparent text-txt-secondary hover:text-txt-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* CARD 1: CAMPUS INFORMATION */}
            <div className="rounded-3xl border border-border-default/80 bg-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg brand-tint text-accent-600">
                    <MapPinIcon className="h-4 w-4" />
                  </div>
                  <h3 className="text-xs font-bold text-txt-primary">Campus Information</h3>
                </div>

                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(formattedAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent-700 hover:underline"
                >
                  <span>View on map</span>
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="flex items-center justify-between text-xs text-txt-secondary pt-1">
                <p className="font-medium text-txt-primary leading-relaxed pr-4">
                  {formattedAddress || "No address specified."}
                </p>
                <ChevronRightIcon className="h-4 w-4 text-txt-muted shrink-0" />
              </div>
            </div>

            {/* CARD 2: SIGNUP LINK */}
            <div data-testid="signup-link-card" className="rounded-3xl border border-border-default/80 bg-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg brand-tint text-accent-600">
                    <LinkIcon className="h-4 w-4" />
                  </div>
                  <h3 className="text-xs font-bold text-txt-primary">Signup Link</h3>
                </div>

                {signupLink && (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      signupLink.active ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-500"
                    )}
                  >
                    {signupLink.active ? "Active" : "Inactive"}
                  </span>
                )}
              </div>

              <p className="text-xs text-txt-secondary font-mono truncate bg-surface-raised p-2 rounded-xl">
                {signupUrl}
              </p>

              {signupLink && !signupLink.active && (
                <p className="text-[11px] font-medium text-amber-600">
                  This link is disabled — parents visiting it cannot register for this campus.
                </p>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl brand-tint font-semibold text-xs hover:bg-accent-100 transition-colors"
                >
                  <ClipboardDocumentIcon className="h-4 w-4" />
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("registrations")}
                  className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl brand-tint font-semibold text-xs hover:bg-accent-100 transition-colors"
                >
                  <ChartBarIcon className="h-4 w-4" />
                  View Link Analytics
                </button>
              </div>

              {signupLink && (
                <button
                  type="button"
                  onClick={handleToggleSignupLink}
                  disabled={isTogglingLink}
                  className={cn(
                    "w-full inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl font-semibold text-xs transition-colors disabled:opacity-50",
                    signupLink.active
                      ? "status-danger text-danger-600 hover:bg-danger-100"
                      : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                  )}
                >
                  {signupLink.active ? (
                    <>
                      <NoSymbolIcon className="h-4 w-4" />
                      {isTogglingLink ? "Disabling…" : "Disable Signup Link"}
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-4 w-4" />
                      {isTogglingLink ? "Enabling…" : "Enable Signup Link"}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* CARD 3: REGISTRATION CAPACITY */}
            <div className="rounded-3xl border border-border-default/80 bg-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg brand-tint text-accent-600">
                    <ChartBarIcon className="h-4 w-4" />
                  </div>
                  <h3 className="text-xs font-bold text-txt-primary">Registration Capacity</h3>
                </div>

                <button
                  type="button"
                  onClick={handleOpenQuotaModal}
                  className="text-xs font-semibold text-accent-700 hover:underline"
                >
                  Edit
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xl font-extrabold text-txt-primary">
                  {stats?.approvedCount ?? 0} <span className="text-txt-muted font-normal text-base">/ {stats?.quota && stats.quota > 0 ? stats.quota : "∞"}</span>
                </span>

                {stats?.quota && stats.quota > 0 ? (
                  <span className={cn(
                    "text-base font-bold transition-colors",
                    (stats.percentUsed ?? 0) >= 100 ? "text-rose-600" : (stats.percentUsed ?? 0) >= 80 ? "text-amber-600" : "text-emerald-600"
                  )}>
                    {stats.percentUsed}%
                  </span>
                ) : null}
              </div>

              <div className="h-2.5 w-full rounded-full bg-surface-raised overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    (stats?.percentUsed ?? 0) >= 100 ? "bg-rose-500" : (stats?.percentUsed ?? 0) >= 80 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${stats?.percentUsed ?? 0}%` }}
                />
              </div>

              <p className="text-xs font-medium text-txt-secondary">
                {stats?.quota && stats.quota > 0
                  ? `${Math.max(0, stats.quota - (stats?.approvedCount ?? 0))} slots remaining`
                  : "Unlimited registration quota"}
              </p>
            </div>

            {/* CARD 4: CAMPUS REPRESENTATIVES */}
            <div className="rounded-3xl border border-border-default/80 bg-surface p-5 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg brand-tint text-accent-600">
                    <UserGroupIcon className="h-4 w-4" />
                  </div>
                  <h3 className="text-xs font-bold text-txt-primary">Campus Representatives</h3>
                </div>

                <span className="text-xs font-semibold text-txt-secondary flex items-center gap-1">
                  {repsList.length} <ChevronRightIcon className="h-3.5 w-3.5 text-txt-muted" />
                </span>
              </div>

              {repsList.length === 0 ? (
                <p className="text-xs text-txt-muted py-2">No representatives assigned.</p>
              ) : (
                <div className="space-y-2 divide-y divide-border-subtle">
                  {repsList.map((rep: any) => (
                    <div key={rep.id} className="flex items-center justify-between pt-2 first:pt-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-200 text-accent-900 text-xs font-bold">
                          {rep.firstName ? rep.firstName[0] : rep.email[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-txt-primary truncate">
                            {[rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full brand-tint px-2.5 py-0.5 text-[10px] font-semibold ">
                          Campus Rep
                        </span>
                        <ChevronRightIcon className="h-4 w-4 text-txt-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-border-subtle text-center">
                <button
                  type="button"
                  onClick={() => router.push("/admin/campuses")}
                  className="inline-flex items-center gap-1 text-xs font-bold text-accent-700 hover:text-accent-800"
                >
                  <PlusIcon className="h-4 w-4 stroke-[2.5]" />
                  <span>Add Representative</span>
                </button>
              </div>
            </div>

            {/* BOTTOM ACTIONS (Edit Campus Button + Delete Button) */}
            <div className="pt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/admin/campuses")}
                className="flex-1 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl brand-tint hover:bg-accent-100 font-bold text-xs transition-all active:scale-98"
              >
                <PencilIcon className="h-4 w-4" />
                Edit Campus
              </button>

              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl status-danger text-danger-600 hover:bg-danger-100 transition-all"
                title="Delete Campus"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: REPRESENTATIVES */}
        {activeTab === "representatives" && (
          <div className="rounded-3xl border border-border-default/80 bg-surface p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold text-txt-primary border-b border-border-subtle pb-2">
              All Assigned Representatives ({repsList.length})
            </h3>
            {repsList.length === 0 ? (
              <p className="text-xs text-txt-muted">No representatives assigned.</p>
            ) : (
              <div className="space-y-3">
                {repsList.map((rep: any) => (
                  <div key={rep.id} className="flex items-center justify-between p-3 rounded-2xl border border-border-subtle bg-surface-raised/50">
                    <div>
                      <p className="text-xs font-bold text-txt-primary">
                        {[rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email}
                      </p>
                      <p className="text-[11px] text-txt-secondary">{rep.email}</p>
                    </div>
                    <span className="rounded-full brand-tint px-2.5 py-0.5 text-[10px] font-semibold ">
                      Campus Rep
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REGISTRATIONS */}
        {activeTab === "registrations" && (
          <div className="space-y-4">
            {stats?.trend && (
              <div className="rounded-3xl border border-border-default/80 bg-surface p-5 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-txt-primary">Registrations Trend</h3>
                <LineChart data={stats.trend.map((item: any) => item.count)} color={accentColor} />
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SETTINGS */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            <div data-testid="campus-suspend-card" className="rounded-3xl border border-border-default/80 bg-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-txt-primary">Campus Status</h3>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    !campus.suspended ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}
                >
                  {!campus.suspended ? "Active" : "Suspended"}
                </span>
              </div>

              <p className="text-xs text-txt-secondary leading-relaxed">
                Suspending this campus blocks new submissions plus any recommendation or approval
                of registrations already in review — without deleting anything. Already-approved
                or checked-in campers, and the signup link itself, are unaffected. This is separate
                from disabling the signup link above.
              </p>

              {campus.suspended && (
                <div className="rounded-xl bg-rose-50 p-3 text-[11px] text-rose-700 space-y-0.5">
                  <p className="font-semibold">This campus is suspended.</p>
                  {campus.suspendedReason && <p>Reason: {campus.suspendedReason}</p>}
                  {campus.suspendedAt && <p>Since {new Date(campus.suspendedAt).toLocaleString()}</p>}
                </div>
              )}

              {campus.suspended ? (
                <Button
                  variant="secondary"
                  loading={isTogglingSuspension}
                  onClick={handleUnsuspend}
                  className="w-full justify-center"
                >
                  <CheckCircleIcon className="mr-1.5 h-4 w-4" />
                  Reactivate Campus
                </Button>
              ) : (
                <Button
                  variant="danger"
                  onClick={() => setIsSuspendModalOpen(true)}
                  className="w-full justify-center"
                >
                  <NoSymbolIcon className="mr-1.5 h-4 w-4" />
                  Suspend Campus
                </Button>
              )}
            </div>

            <div className="rounded-3xl border border-border-default/80 bg-surface p-5 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-txt-primary border-b border-border-subtle pb-2">
                Campus Operations & Settings
              </h3>
              <p className="text-xs text-txt-secondary">
                To update campus metadata, code, display order, or delete this campus, return to the main campuses overview dashboard.
              </p>
              <Button onClick={() => router.push("/admin/campuses")}>
                Go to Campuses Dashboard
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* QUOTA / CAPACITY MODAL */}
      <Dialog open={isQuotaModalOpen} onClose={() => setIsQuotaModalOpen(false)} title="Edit Registration Capacity" size="sm">
        {quotaError && <div className="mb-4 rounded-xl status-danger p-3 text-xs ">{quotaError}</div>}
        <div className="space-y-4">
          <Input
            label="Registration Capacity / Quota (0 = Unlimited)"
            type="number"
            id="quota"
            value={quotaFormData.quota}
            onChange={(e) => setQuotaFormData({ ...quotaFormData, quota: parseInt(e.target.value, 10) || 0 })}
          />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-txt-secondary mb-1">
              When Capacity Reached
            </label>
            <select
              className="w-full border border-border-default rounded-xl px-3 py-2 text-xs font-medium text-txt-primary bg-surface focus:ring-2 focus:ring-accent-500"
              value={quotaFormData.quotaFullBehavior}
              onChange={(e) => setQuotaFormData({ ...quotaFormData, quotaFullBehavior: e.target.value as "CLOSE" | "WAITLIST" })}
            >
              <option value="CLOSE">Close — Block new registrations once full</option>
              <option value="WAITLIST">Waitlist — Accept submissions and waitlist excess</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-border-subtle pt-3">
          <Button variant="secondary" onClick={() => setIsQuotaModalOpen(false)}>
            Cancel
          </Button>
          <Button loading={updateQuotaMutation.isPending} onClick={handleSaveQuota}>
            Save Capacity
          </Button>
        </div>
      </Dialog>

      {/* SUSPEND CAMPUS DIALOG */}
      <Dialog open={isSuspendModalOpen} onClose={() => setIsSuspendModalOpen(false)} title="Suspend Campus" size="sm">
        <p className="text-xs text-txt-secondary">
          This blocks new submissions and pauses any recommendation or approval of{" "}
          <span className="font-bold">{campus.name}</span>'s pending registrations. Already-approved
          campers and the signup link are not affected. You can reactivate at any time.
        </p>
        <div className="mt-4">
          <Input
            label="Reason (optional, visible to org admins)"
            id="suspend-reason"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="e.g. Investigating a reported issue"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsSuspendModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={suspendCampusMutation.isPending} onClick={handleConfirmSuspend}>
            Suspend Campus
          </Button>
        </div>
      </Dialog>

      {/* DELETE DIALOG */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Campus" size="sm">
        <p className="text-xs text-txt-secondary">
          Are you sure you want to delete <span className="font-bold">{campus.name}</span>? This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deleteCampusMutation.isPending}
            onClick={() => deleteCampusMutation.mutate({ id: campus.id })}
          >
            Delete Campus
          </Button>
        </div>
      </Dialog>
    </AppShell>
  );
};

export default CampusDetailsPage;
