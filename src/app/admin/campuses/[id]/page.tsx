"use client";

import { useParams, useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import React, { useState } from "react";
import StatCard from "../../components/StatCard";
import LineChart from "../../components/LineChart";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Dialog } from "@/components/ui/Dialog";
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
} from "@heroicons/react/24/outline";

const CampusDetailsPage = () => {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const [activeTab, setActiveTab] = useState<"overview" | "representatives" | "registrations" | "settings">("overview");
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: campus, isLoading, error } = api.campus.getById.useQuery(
    { id },
    { enabled: !!id }
  );

  const { data: stats } = api.campus.getStats.useQuery(
    { campusId: id },
    { enabled: !!id }
  );

  const deleteCampusMutation = api.campus.delete.useMutation({
    onSuccess: () => {
      router.push("/admin/campuses");
    },
  });

  if (isLoading) {
    return (
      <AppShell area="admin">
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-purple-600" />
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

  const repsList = Array.isArray((campus as any).reps) ? (campus as any).reps : [];

  return (
    <AppShell area="admin">
      <div className="max-w-xl mx-auto space-y-5 pb-12">
        {/* TOP BAR NAV */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => router.push("/admin/campuses")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-neutral-600 border border-neutral-200/80 hover:bg-neutral-50 transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5 stroke-[2.5]" />
          </button>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-neutral-600 border border-neutral-200/80 hover:bg-neutral-50 transition-colors"
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </button>
        </div>

        {/* CAMPUS IDENTITY EMBLEM & TITLE */}
        <div className="space-y-3 pt-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-purple-100/70 text-purple-700 text-3xl font-medium shadow-2xs">
            ⛪
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{campus.name}</h1>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                • Active
              </span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-neutral-500">
              {campus.campusCode ? `${campus.campusCode}` : "No Code"}
              <span className="mx-1.5 text-neutral-300">•</span>
              Order #{campus.displayOrder ?? 0}
            </p>
          </div>
        </div>

        {/* UNDERLINE TABS */}
        <div className="border-b border-neutral-200/80">
          <nav className="flex space-x-6">
            {tabOptions.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 text-xs font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? "border-purple-600 text-purple-700 font-bold"
                    : "border-transparent text-neutral-500 hover:text-neutral-900"
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
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 text-xs">
                    📍
                  </div>
                  <h3 className="text-xs font-bold text-neutral-900">Campus Information</h3>
                </div>

                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(formattedAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:underline"
                >
                  <span>View on map</span>
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="flex items-center justify-between text-xs text-neutral-700 pt-1">
                <p className="font-medium text-neutral-800 leading-relaxed pr-4">
                  {formattedAddress || "No address specified."}
                </p>
                <ChevronRightIcon className="h-4 w-4 text-neutral-400 shrink-0" />
              </div>
            </div>

            {/* CARD 2: SIGNUP LINK */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 text-xs">
                    🔗
                  </div>
                  <h3 className="text-xs font-bold text-neutral-900">Signup Link</h3>
                </div>

                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                  Active
                </span>
              </div>

              <p className="text-xs text-neutral-500 font-mono truncate bg-neutral-50 p-2 rounded-xl">
                {signupUrl}
              </p>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl bg-purple-50 text-purple-700 font-semibold text-xs hover:bg-purple-100 transition-colors"
                >
                  <ClipboardDocumentIcon className="h-4 w-4" />
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("registrations")}
                  className="flex-1 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-2xl bg-purple-50 text-purple-700 font-semibold text-xs hover:bg-purple-100 transition-colors"
                >
                  <ChartBarIcon className="h-4 w-4" />
                  View Link Analytics
                </button>
              </div>
            </div>

            {/* CARD 3: REGISTRATION CAPACITY */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 text-xs">
                    📊
                  </div>
                  <h3 className="text-xs font-bold text-neutral-900">Registration Capacity</h3>
                </div>

                <button
                  type="button"
                  onClick={() => router.push("/admin/campuses")}
                  className="text-xs font-semibold text-purple-700 hover:underline"
                >
                  Edit
                </button>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xl font-extrabold text-neutral-900">
                  {stats?.approvedCount ?? 0} <span className="text-neutral-400 font-normal text-base">/ {stats?.quota && stats.quota > 0 ? stats.quota : "∞"}</span>
                </span>

                {stats?.quota && stats.quota > 0 ? (
                  <span className="text-base font-bold text-emerald-600">{stats.percentUsed}%</span>
                ) : null}
              </div>

              <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${stats?.percentUsed ?? 0}%` }}
                />
              </div>

              <p className="text-xs font-medium text-neutral-500">
                {stats?.quota && stats.quota > 0
                  ? `${Math.max(0, stats.quota - (stats?.approvedCount ?? 0))} slots remaining`
                  : "Unlimited registration quota"}
              </p>
            </div>

            {/* CARD 4: CAMPUS REPRESENTATIVES */}
            <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 text-xs">
                    👥
                  </div>
                  <h3 className="text-xs font-bold text-neutral-900">Campus Representatives</h3>
                </div>

                <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1">
                  {repsList.length} <ChevronRightIcon className="h-3.5 w-3.5 text-neutral-400" />
                </span>
              </div>

              {repsList.length === 0 ? (
                <p className="text-xs text-neutral-400 py-2">No representatives assigned.</p>
              ) : (
                <div className="space-y-2 divide-y divide-neutral-100">
                  {repsList.map((rep: any) => (
                    <div key={rep.id} className="flex items-center justify-between pt-2 first:pt-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-200 text-purple-900 text-xs font-bold">
                          {rep.firstName ? rep.firstName[0] : rep.email[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900 truncate">
                            {[rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700">
                          Campus Rep
                        </span>
                        <ChevronRightIcon className="h-4 w-4 text-neutral-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-neutral-100 text-center">
                <button
                  type="button"
                  onClick={() => router.push("/admin/campuses")}
                  className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-800"
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
                className="flex-1 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold text-xs transition-all active:scale-98"
              >
                <PencilIcon className="h-4 w-4" />
                Edit Campus
              </button>

              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl bg-danger-50 text-danger-600 hover:bg-danger-100 transition-all"
                title="Delete Campus"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: REPRESENTATIVES */}
        {activeTab === "representatives" && (
          <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold text-neutral-900 border-b border-neutral-100 pb-2">
              All Assigned Representatives ({repsList.length})
            </h3>
            {repsList.length === 0 ? (
              <p className="text-xs text-neutral-400">No representatives assigned.</p>
            ) : (
              <div className="space-y-3">
                {repsList.map((rep: any) => (
                  <div key={rep.id} className="flex items-center justify-between p-3 rounded-2xl border border-neutral-100 bg-neutral-50/50">
                    <div>
                      <p className="text-xs font-bold text-neutral-900">
                        {[rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.email}
                      </p>
                      <p className="text-[11px] text-neutral-500">{rep.email}</p>
                    </div>
                    <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700">
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
              <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-neutral-900">Registrations Trend</h3>
                <LineChart data={stats.trend.map((item: any) => item.count)} color="#9333ea" />
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SETTINGS */}
        {activeTab === "settings" && (
          <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-neutral-900 border-b border-neutral-100 pb-2">
              Campus Operations & Settings
            </h3>
            <p className="text-xs text-neutral-600">
              To update campus metadata, code, display order, or delete this campus, return to the main campuses overview dashboard.
            </p>
            <Button onClick={() => router.push("/admin/campuses")}>
              Go to Campuses Dashboard
            </Button>
          </div>
        )}
      </div>

      {/* DELETE DIALOG */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Campus" size="sm">
        <p className="text-xs text-neutral-600">
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
