"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import {
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

export interface StaffWorkspaceTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface StaffWorkspaceProps {
  staffId: string;
  tabs: StaffWorkspaceTab[];
  defaultTab?: string;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function StaffWorkspace({ staffId, tabs, defaultTab, onPrevious, onNext }: StaffWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id);
  const utils = api.useUtils();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const approve = api.staff.approve.useMutation({
    onSuccess: () => {
      utils.staff.getById.invalidate({ id: staffId });
      utils.staff.adminList.invalidate();
      utils.staff.stats.invalidate();
    },
  });
  const reject = api.staff.reject.useMutation({
    onSuccess: () => {
      setRejectOpen(false);
      setRejectReason("");
      utils.staff.getById.invalidate({ id: staffId });
      utils.staff.adminList.invalidate();
      utils.staff.stats.invalidate();
    },
  });
  const { data: profile, isLoading } = api.staff.getById.useQuery({ id: staffId });

  if (isLoading || !profile) {
    return (
      <div className="flex min-h-[450px] items-center justify-center p-8 text-neutral-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
          <span className="text-sm font-medium">Loading…</span>
        </div>
      </div>
    );
  }

  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const activeTabContent = tabs.find((t) => t.id === activeTab)?.content ?? tabs[0]?.content;

  return (
    <div className="min-h-screen bg-neutral-50/60 pb-24">
      {/* Utility header */}
      <div className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button
            type="button"
            onClick={() => router.push(`/admin/${profile.type === "TEACHER" ? "teachers" : "volunteers"}`)}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-accent-600 transition"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to {profile.type === "TEACHER" ? "Teachers" : "Volunteers"}
          </button>

          {profile.status === "PENDING" && (
            <div className="flex items-center gap-2">
              <Button size="sm" data-testid="approve-button" loading={approve.isPending} onClick={() => approve.mutate({ id: staffId })}>Approve</Button>
              <Button size="sm" variant="secondary" data-testid="reject-button" loading={reject.isPending} onClick={() => setRejectOpen(true)}>Reject</Button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6 space-y-6">
        {/* Profile banner */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-100 text-accent-700 font-bold text-xl overflow-hidden border border-accent-200">
                {profile.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.photoUrl} alt={name} className="h-full w-full object-cover" />
                ) : (
                  <span>{initials || "?"}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold text-neutral-900">{name}</h1>
                  <StatusBadge status={profile.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-600">
                  {profile.email && <span>{profile.email}</span>}
                  {profile.phone && <span>{profile.phone}</span>}
                  {profile.preferredCampus?.name && (
                    <span className="inline-flex items-center gap-1 text-accent-700 font-medium">{profile.preferredCampus.name}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
              {profile.assignedVenue?.name && (
                <div className="rounded-lg bg-neutral-50 px-3 py-1.5 border border-neutral-100">
                  <span className="text-neutral-400">Venue</span>{" "}
                  <span className="font-semibold text-neutral-800">{profile.assignedVenue.name}</span>
                </div>
              )}
              {profile.type === "TEACHER" && profile.assignedTribe?.name && (
                <div className="rounded-lg bg-neutral-50 px-3 py-1.5 border border-neutral-100">
                  <span className="text-neutral-400">Tribe</span>{" "}
                  <span className="font-semibold text-neutral-800">{profile.assignedTribe.name}</span>
                </div>
              )}
              {profile.department?.name && (
                <div className="rounded-lg bg-neutral-50 px-3 py-1.5 border border-neutral-100">
                  <span className="text-neutral-400">Dept</span>{" "}
                  <span className="font-semibold text-neutral-800">{profile.department.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs — match list page style */}
        <div className="border-b border-neutral-200">
          <nav className="flex space-x-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative pb-3 text-sm font-semibold transition",
                  activeTab === tab.id
                    ? "text-accent-700"
                    : "text-neutral-500 hover:text-neutral-900"
                )}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent-600" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="space-y-6">{activeTabContent}</div>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject staff profile" size="sm">
        <div className="space-y-4">
          <Input label="Rejection reason" placeholder="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={reject.isPending} disabled={!rejectReason.trim()} onClick={() => reject.mutate({ id: staffId, reason: rejectReason.trim() })}>Reject</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
