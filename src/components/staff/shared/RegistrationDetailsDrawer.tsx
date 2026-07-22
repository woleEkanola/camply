"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Input";
import { SearchBar } from "@/components/ui/SearchBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import { Dialog } from "@/components/ui/Dialog";
import { StatusDialog } from "@/app/admin/registrations/components/StatusDialog";
import { CommunicationCard } from "@/app/admin/registrations/components/CommunicationCard";
import { DecisionHistory } from "@/app/admin/registrations/components/DecisionHistory";
import ReviewProgress from "@/app/admin/registrations/components/ReviewProgress";
import VerifierAssignment from "@/app/admin/registrations/components/VerifierAssignment";
import ChangesSinceReview from "@/app/admin/registrations/components/ChangesSinceReview";
import { RegistrationDocumentPanel } from "@/components/staff/shared/RegistrationDocumentPanel";
import { CamperProfileView } from "@/components/staff/shared/CamperProfileView";
import { CamperPhotoCropperModal } from "@/components/staff/shared/CamperPhotoCropperModal";
import { CommunicationTimeline } from "@/components/communication/CommunicationTimeline";

import {
  ChevronLeftIcon,
  EllipsisVerticalIcon,
  InformationCircleIcon,
  ClockIcon,
  Squares2X2Icon,
  PencilIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  PaperAirplaneIcon,
  PrinterIcon,
  QrCodeIcon,
  CheckCircleIcon,
  XMarkIcon,
  CheckIcon,
  PhoneIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";

interface RegistrationDetailsDrawerProps {
  registrationId: string;
  onClose: () => void;
}

export function RegistrationDetailsDrawer({
  registrationId,
  onClose,
}: RegistrationDetailsDrawerProps) {
  const utils = api.useUtils();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "assignments" | "activity" | "documents" | "review" | "communication">("overview");

  const [rejectReason, setRejectReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [actionError, setActionError] = useState("");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  // Queries
  const { data: registration, refetch } = api.registration.getById.useQuery({ id: registrationId });
  const { data: documents } = api.document.listForRegistration.useQuery({ registrationId });
  const { data: timeline } = api.registration.timeline.useQuery({ registrationId });
  const { data: review, refetch: refetchReview } = api.registration.getReview.useQuery({ registrationId });
  const { data: tribes } = api.tribe.listByCamp.useQuery(
    { campId: registration?.campId ?? "" },
    { enabled: !!registration?.campId }
  );
  const { data: tribeSuggestion } = api.tribe.suggest.useQuery(
    { registrationId },
    { enabled: registration?.status === "APPROVED" && !(registration as any)?.tribeId }
  );
  const orgId = (registration?.camp as any)?.organizationId || (registration?.campus as any)?.organizationId;
  const { data: org } = api.organization.getById.useQuery({ id: orgId ?? "" }, { enabled: !!orgId });
  const isTwoStep = (org as any)?.approvalWorkflow === "TWO_STEP";

  const { data: campusesData } = api.campus.getByOrganization.useQuery(
    { organizationId: orgId ?? "" },
    { enabled: !!orgId }
  );
  const campuses = campusesData ?? [];
  const { data: formFieldsData } = api.formField.list.useQuery(
    { organizationId: orgId ?? "", audience: "CAMPER" },
    { enabled: !!orgId }
  );
  const formFields = formFieldsData ?? [];
  const { data: commTimeline } = api.communication.timelineForRegistration.useQuery({ registrationId });

  const invalidate = () => {
    refetch();
    utils.registration.timeline.invalidate({ registrationId });
    utils.registration.adminList.invalidate();
  };

  const onErr = (e: { message: string }) => setActionError(e.message);

  // Mutations
  const approve = api.registration.approve.useMutation({ onSuccess: invalidate, onError: onErr });
  const reject = api.registration.reject.useMutation({
    onSuccess: () => {
      setRejectReason("");
      setRejectDialogOpen(false);
      invalidate();
    },
    onError: onErr,
  });
  const requestCorrection = api.registration.requestCorrection.useMutation({
    onSuccess: () => {
      setCorrectionMessage("");
      setCorrectionDialogOpen(false);
      invalidate();
    },
    onError: onErr,
  });
  const waitlist = api.registration.waitlist.useMutation({ onSuccess: invalidate, onError: onErr });
  const addNote = api.registration.addInternalNote.useMutation({
    onSuccess: () => {
      setNoteText("");
      invalidate();
    },
    onError: onErr,
  });
  const archive = api.registration.archive.useMutation({ onSuccess: invalidate, onError: onErr });
  const cancelReg = api.registration.cancelMine.useMutation({ onSuccess: invalidate, onError: onErr });
  const assignTribe = api.tribe.assign.useMutation({ onSuccess: invalidate, onError: onErr });
  const clearTribe = api.tribe.clear.useMutation({ onSuccess: invalidate, onError: onErr });
  const transitionWithOptions = api.registration.transitionWithOptions.useMutation({ onSuccess: invalidate, onError: onErr });
  const advanceFromRequiresAction = api.registration.advanceFromRequiresAction.useMutation({ onSuccess: invalidate, onError: onErr });
  const reassignCampus = api.registration.reassignCampus.useMutation({ onSuccess: invalidate, onError: onErr });

  if (!registration) {
    return (
      <Drawer open onClose={onClose} title="Registration Details">
        <div className="flex h-64 items-center justify-center p-6 text-sm text-neutral-500">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
        </div>
      </Drawer>
    );
  }

  const camper = registration.camper as any;
  const camperName = camper?.name || "Camper";
  const parentUser = camper?.user || (registration as any).parent;
  const parentName = parentUser?.firstName
    ? `${parentUser.firstName} ${parentUser.lastName || ""}`
    : parentUser?.name || "Parent";
  const parentEmail = parentUser?.email || "No email";
  const parentPhone = parentUser?.phone || "No phone";
  const regNumber = registration.registrationNumber || `MYD-${registration.id.slice(-5)}`;
  const regDate = registration.createdAt
    ? new Date(registration.createdAt).toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "18/07/2026, 10:30 AM";
  const updatedDate = registration.updatedAt
    ? new Date(registration.updatedAt).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Yesterday, 9:15 PM";

  const handlePrintBadge = () => {
    window.print();
  };

  return (
    <>
      <Drawer open onClose={onClose} title="">
        <div className="flex flex-col h-full bg-neutral-50/50 pb-20">
          {/* 1. TOP HEADER BAR */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border-default bg-surface px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-txt-secondary hover:text-neutral-900 rounded-lg hover:bg-surface-raised transition"
              aria-label="Back"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h2 className="text-base font-bold text-neutral-900">Registration Details</h2>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreActionsOpen((prev) => !prev)}
                className="p-1 text-txt-secondary hover:text-neutral-900 rounded-lg hover:bg-surface-raised transition"
                aria-label="More options"
              >
                <EllipsisVerticalIcon className="h-5 w-5" />
              </button>

              {moreActionsOpen && (
                <div className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-border-default bg-surface py-1 shadow-lg ring-1 ring-black/5">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      setStatusDialogOpen(true);
                    }}
                    className="flex w-full items-center px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-accent-50"
                  >
                    Change Status
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      waitlist.mutate({ registrationId });
                    }}
                    className="flex w-full items-center px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                  >
                    Waitlist
                  </button>
                  {registration.status === "REQUIRES_ACTION" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreActionsOpen(false);
                        advanceFromRequiresAction.mutate({ registrationId });
                      }}
                      className="flex w-full items-center px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                    >
                      Advance to Review
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      cancelReg.mutate({ registrationId });
                    }}
                    className="flex w-full items-center px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-surface-raised"
                  >
                    Cancel Registration
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      archive.mutate({ registrationId });
                    }}
                    className="flex w-full items-center px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-surface-raised"
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          </div>

          {actionError && (
            <div className="m-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200 flex justify-between items-center">
              <span>{actionError}</span>
              <button onClick={() => setActionError("")} className="font-bold underline text-[11px]">Dismiss</button>
            </div>
          )}

          {/* 2. CAMPER / PARENT PROFILE BANNER */}
          <div className="bg-surface p-5 border-b border-border-default">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => setPhotoModalOpen(true)}
                  className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-800 font-extrabold text-xl overflow-hidden border border-accent-200 cursor-pointer hover:ring-2 hover:ring-accent-500/60 transition-all"
                  title="Click to view/crop photo"
                >
                  {camper?.photoUrl ? (
                    <img src={camper.photoUrl} alt={camperName} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <span>{camperName.charAt(0)}</span>
                  )}
                  <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <PencilIcon className="h-4 w-4 text-white drop-shadow-xs" />
                  </div>
                </button>
                <div>
                  <h1 className="text-lg font-bold text-neutral-900 leading-tight">{camperName}</h1>
                  <span className="inline-block mt-0.5 rounded-full bg-accent-50 px-2.5 py-0.5 text-[11px] font-semibold text-accent-700">
                    Parent
                  </span>
                  <div className="mt-1 space-y-0.5 text-xs text-neutral-500 font-medium">
                    <div className="flex items-center gap-1.5">
                      <EnvelopeIcon className="h-3.5 w-3.5 text-txt-muted" />
                      <span>{parentEmail}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <PhoneIcon className="h-3.5 w-3.5 text-txt-muted" />
                      <span>{parentPhone}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <StatusBadge status={registration.status} />
              </div>
            </div>
          </div>

          {/* 3. NAVIGATION TABS */}
          <div className="bg-surface border-b border-border-default flex gap-5 px-5 overflow-x-auto no-scrollbar text-xs font-semibold">
            {[
              { id: "overview", label: "Overview" },
              { id: "details", label: "Details" },
              { id: "assignments", label: "Assignments" },
              { id: "activity", label: "Activity" },
              { id: "documents", label: `Documents (${(documents ?? []).length})` },
              ...(isTwoStep ? [{ id: "review", label: "Review" }] : []),
              { id: "communication", label: "Communication" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "py-3 border-b-2 transition whitespace-nowrap",
                  activeTab === tab.id
                    ? "border-accent-600 text-accent-600 font-bold"
                    : "border-transparent text-neutral-500 hover:text-neutral-800"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 4. TAB CONTENT */}
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* 1. Registration Information Card */}
                <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-neutral-900 font-bold text-sm border-b border-border-subtle pb-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-50 text-accent-600">
                      <InformationCircleIcon className="h-4 w-4" />
                    </div>
                    <span>Registration Information</span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-medium">Campus</span>
                      {campuses.length > 0 ? (
                        <Select
                          containerClassName="w-44"
                          value={registration.campusId}
                          onChange={(e) => {
                            if (e.target.value) reassignCampus.mutate({ registrationId, newCampusId: e.target.value });
                          }}
                          disabled={reassignCampus.isPending}
                        >
                          {campuses.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </Select>
                      ) : (
                        <span className="font-bold text-neutral-900">{registration.campus?.name}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-medium">Registration #</span>
                      <span className="font-bold font-mono text-neutral-900">{regNumber}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-medium">Registered On</span>
                      <span className="font-bold text-neutral-900">{regDate}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-medium">Updated</span>
                      <span className="font-bold text-neutral-900">{updatedDate}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-medium">Source</span>
                      <span className="font-bold text-neutral-900">Signup Link</span>
                    </div>
                  </div>
                </div>

                {/* 2. Status Timeline Card */}
                <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-neutral-900 font-bold text-sm border-b border-border-subtle pb-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-50 text-accent-600">
                      <ClockIcon className="h-4 w-4" />
                    </div>
                    <span>Status Timeline</span>
                  </div>

                  <div className="space-y-3 pt-1">
                    {(timeline ?? []).slice(0, 3).map((item: any, idx: number) => (
                      <div key={item.id || idx} className="relative flex items-start gap-3 text-xs">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold mt-0.5">
                          <CheckCircleIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-neutral-900 capitalize">{item.action.replace(/_/g, " ").toLowerCase()}</div>
                          <div className="text-[11px] text-neutral-500">by Staff Reviewer</div>
                        </div>
                        <div className="text-[11px] text-txt-muted shrink-0 font-medium">
                          {new Date(item.createdAt).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                    ))}
                    {(timeline ?? []).length === 0 && (
                      <div className="text-xs text-neutral-500 py-1">No status timeline events recorded yet.</div>
                    )}
                  </div>
                </div>

                {/* 3. Quick Actions Grid */}
                <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-neutral-900 font-bold text-sm border-b border-border-subtle pb-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-50 text-accent-600">
                      <Squares2X2Icon className="h-4 w-4" />
                    </div>
                    <span>Quick Actions</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab("details")}
                      className="flex items-center justify-between rounded-xl border border-border-default bg-surface p-3 text-xs font-bold text-neutral-800 hover:bg-accent-50 hover:border-accent-200 transition"
                    >
                      <div className="flex items-center gap-2">
                        <PencilIcon className="h-4 w-4 text-accent-600" />
                        <span>Edit Registration</span>
                      </div>
                      <span className="text-txt-muted">›</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("assignments")}
                      className="flex items-center justify-between rounded-xl border border-border-default bg-surface p-3 text-xs font-bold text-neutral-800 hover:bg-accent-50 hover:border-accent-200 transition"
                    >
                      <div className="flex items-center gap-2">
                        <UserGroupIcon className="h-4 w-4 text-accent-600" />
                        <span>Assign Tribe</span>
                      </div>
                      <span className="text-txt-muted">›</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("assignments")}
                      className="flex items-center justify-between rounded-xl border border-border-default bg-surface p-3 text-xs font-bold text-neutral-800 hover:bg-accent-50 hover:border-accent-200 transition"
                    >
                      <div className="flex items-center gap-2">
                        <BuildingOfficeIcon className="h-4 w-4 text-accent-600" />
                        <span>Assign Hostel</span>
                      </div>
                      <span className="text-txt-muted">›</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("communication")}
                      className="flex items-center justify-between rounded-xl border border-border-default bg-surface p-3 text-xs font-bold text-neutral-800 hover:bg-accent-50 hover:border-accent-200 transition"
                    >
                      <div className="flex items-center gap-2">
                        <PaperAirplaneIcon className="h-4 w-4 text-accent-600" />
                        <span>Send Email / SMS</span>
                      </div>
                      <span className="text-txt-muted">›</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrintBadge}
                      className="flex items-center justify-between rounded-xl border border-border-default bg-surface p-3 text-xs font-bold text-neutral-800 hover:bg-accent-50 hover:border-accent-200 transition"
                    >
                      <div className="flex items-center gap-2">
                        <PrinterIcon className="h-4 w-4 text-accent-600" />
                        <span>Print Badge</span>
                      </div>
                      <span className="text-txt-muted">›</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQrModalOpen(true)}
                      className="flex items-center justify-between rounded-xl border border-border-default bg-surface p-3 text-xs font-bold text-neutral-800 hover:bg-accent-50 hover:border-accent-200 transition"
                    >
                      <div className="flex items-center gap-2">
                        <QrCodeIcon className="h-4 w-4 text-accent-600" />
                        <span>View QR Code</span>
                      </div>
                      <span className="text-txt-muted">›</span>
                    </button>
                  </div>
                </div>

                {/* 4. Internal Notes */}
                <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-2xs space-y-3">
                  <h3 className="font-bold text-neutral-900 text-sm border-b border-border-subtle pb-2">Internal Notes</h3>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 text-xs">
                    {Array.isArray(registration.internalNotes) && (registration.internalNotes as any[]).map((n, i) => (
                      <div key={i} className="rounded-lg bg-surface-raised p-2 text-neutral-700">
                        <span>{n.text}</span>
                        <span className="block text-[10px] text-txt-muted mt-0.5">{new Date(n.at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <SearchBar containerClassName="flex-1" placeholder="Add a private note" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                    <Button size="sm" disabled={!noteText.trim()} loading={addNote.isPending} onClick={() => addNote.mutate({ registrationId, text: noteText.trim() })}>
                      Add Note
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* DETAILS TAB */}
            {activeTab === "details" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-info-50 p-3 text-xs text-info-700 border border-info-200">
                  <strong>Consent Form</strong> is tracked separately for camper authorization.
                </div>
                <CamperProfileView camper={registration.camper as any} registration={registration as any} formFields={formFields as any} />
              </div>
            )}

            {/* ASSIGNMENTS TAB */}
            {activeTab === "assignments" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-2xs space-y-3">
                  <h3 className="font-bold text-neutral-900 text-sm border-b border-border-subtle pb-2">Tribe Assignment</h3>
                  {tribeSuggestion && !(registration as any).tribeId && (
                    <div className="rounded-xl bg-accent-50 p-3 text-xs text-accent-700 border border-accent-200">
                      Suggested: <strong>{tribeSuggestion.tribeName}</strong> ({tribeSuggestion.confidence}% confidence)
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Select
                      containerClassName="flex-1"
                      value={(registration as any).tribeId ?? ""}
                      onChange={(e) => {
                        if (e.target.value) assignTribe.mutate({ registrationId, tribeId: e.target.value });
                      }}
                    >
                      <option value="">Unassigned</option>
                      {(tribes ?? []).map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.population}{t.maxCapacity ? `/${t.maxCapacity}` : ""})
                        </option>
                      ))}
                    </Select>
                    {(registration as any).tribeId && (
                      <Button variant="secondary" size="sm" onClick={() => clearTribe.mutate({ registrationId })}>
                        Clear
                      </Button>
                    )}
                    {tribeSuggestion && !(registration as any).tribeId && (
                      <Button size="sm" onClick={() => assignTribe.mutate({ registrationId, tribeId: tribeSuggestion.tribeId })}>
                        Use Suggestion
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ACTIVITY TAB */}
            {activeTab === "activity" && (
              <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-2xs space-y-3">
                <h3 className="font-bold text-neutral-900 text-sm border-b border-border-subtle pb-2">Activity Log</h3>
                <ul className="space-y-2 text-xs">
                  {(timeline ?? []).map((event: any) => (
                    <li key={event.id} className="text-txt-secondary border-b border-border-subtle pb-1.5">
                      <span className="text-[10px] text-txt-muted block">{new Date(event.createdAt).toLocaleString()}</span>
                      <span className="font-semibold text-neutral-900 capitalize">{event.action.replace(/_/g, " ").toLowerCase()}</span>
                    </li>
                  ))}
                  {(timeline ?? []).length === 0 && <p className="text-neutral-500">No activity recorded yet.</p>}
                </ul>
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {activeTab === "documents" && (
              <RegistrationDocumentPanel registrationId={registrationId} />
            )}

            {/* REVIEW TAB */}
            {activeTab === "review" && isTwoStep && (
              <div className="space-y-4">
                {review && <ReviewProgress registration={registration} review={review} isTwoStep={isTwoStep} />}
                <VerifierAssignment
                  registration={{ id: registration.id }}
                  review={review}
                  assignee={(review as any)?.assignee}
                  organizationId={orgId ?? ""}
                  currentUserId={(session?.user as any)?.id ?? ""}
                  isTwoStep={isTwoStep}
                  onRefresh={() => { refetchReview(); invalidate(); }}
                />
                <ChangesSinceReview registration={{ fieldChangeLog: (registration as any).fieldChangeLog }} />
                <CommunicationCard registration={registration} />
                <DecisionHistory timeline={timeline ?? []} />
              </div>
            )}

            {/* COMMUNICATION TAB */}
            {activeTab === "communication" && (
              <CommunicationTimeline events={commTimeline ?? []} />
            )}
          </div>

          {/* 5. FIXED BOTTOM ACTION BAR */}
          <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border-default bg-surface p-3.5 shadow-2xl">
            <div className="flex items-center gap-2 max-w-lg mx-auto">
              <Button
                variant="secondary"
                className="flex-1 justify-center text-xs font-bold text-neutral-700 py-2.5"
                onClick={() => setStatusDialogOpen(true)}
              >
                <EllipsisVerticalIcon className="mr-1 h-4 w-4 text-neutral-500" />
                More Actions
              </Button>

              <Button
                className="flex-1 justify-center text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 py-2.5"
                onClick={() => setRejectDialogOpen(true)}
              >
                <XMarkIcon className="mr-1 h-4 w-4 text-rose-600" />
                Reject
              </Button>

              <Button
                className="flex-1 justify-center text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 py-2.5 shadow-xs"
                loading={approve.isPending}
                onClick={() => approve.mutate({ registrationId })}
              >
                <CheckIcon className="mr-1 h-4 w-4" />
                Approve
              </Button>
            </div>
          </div>
        </div>
      </Drawer>

      {/* QR CODE MODAL */}
      <Dialog open={qrModalOpen} onClose={() => setQrModalOpen(false)} title="Camper QR Code" size="sm">
        <div className="flex flex-col items-center justify-center p-4 text-center space-y-3">
          <div className="p-3 bg-surface border border-border-default rounded-2xl shadow-xs">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(regNumber)}`}
              alt="QR Code"
              className="h-48 w-48 object-contain"
            />
          </div>
          <div className="font-bold font-mono text-neutral-900 text-sm">#{regNumber}</div>
          <p className="text-xs text-neutral-500">Scan at check-in counter to verify camper registration.</p>
        </div>
      </Dialog>

      {/* REJECT REASON DIALOG */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} title="Reject Registration" size="sm">
        <p className="text-xs text-neutral-500">
          Provide a reason for rejection. This message will be sent to the parent.
        </p>
        <Textarea
          className="mt-3 text-xs"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Reason for rejection..."
          rows={3}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!rejectReason.trim()}
            loading={reject.isPending}
            onClick={() => reject.mutate({ registrationId, reason: rejectReason.trim() })}
          >
            Reject Registration
          </Button>
        </div>
      </Dialog>

      {/* CORRECTION MESSAGE DIALOG */}
      <Dialog open={correctionDialogOpen} onClose={() => setCorrectionDialogOpen(false)} title="Request Correction" size="sm">
        <p className="text-xs text-neutral-500">
          Describe the required correction. An email notification will be sent to the parent.
        </p>
        <Textarea
          className="mt-3 text-xs"
          value={correctionMessage}
          onChange={(e) => setCorrectionMessage(e.target.value)}
          placeholder="Describe required correction..."
          rows={3}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCorrectionDialogOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            className="bg-amber-600 text-white hover:bg-amber-700"
            disabled={!correctionMessage.trim()}
            loading={requestCorrection.isPending}
            onClick={() => requestCorrection.mutate({ registrationId, message: correctionMessage.trim() })}
          >
            Request Correction
          </Button>
        </div>
      </Dialog>

      {/* STATUS DIALOG */}
      <StatusDialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
        registration={registration}
        isTwoStep={isTwoStep}
        review={review}
        onSubmit={(action, options) => {
          transitionWithOptions.mutate({
            registrationId: registration.id,
            action,
            reason: options.reason,
            message: options.message,
            sendEmail: options.sendEmail,
          });
          setStatusDialogOpen(false);
        }}
      />

      {/* CAMPER PHOTO EXPAND & CROP MODAL */}
      <CamperPhotoCropperModal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        camperId={camper?.id || ""}
        camperName={camperName}
        photoUrl={camper?.photoUrl}
        onPhotoUpdated={() => refetch()}
      />
    </>
  );
}
