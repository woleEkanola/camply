"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/utils/trpc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Textarea, Select } from "@/components/ui/Input";
import { DocumentViewerDrawer } from "./DocumentViewerDrawer";
import { AuditTimeline } from "./AuditTimeline";
import {
  ApproveDecisionDialog,
  RequestCorrectionDecisionDialog,
  RejectDecisionDialog,
} from "./ReviewDecisionDialogs";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  PhoneIcon,
  EnvelopeIcon,
  UserIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

interface RegistrationReviewWorkspaceProps {
  registrationId: string;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function RegistrationReviewWorkspace({
  registrationId,
  onBack,
  onPrevious,
  onNext,
}: RegistrationReviewWorkspaceProps) {
  const utils = api.useUtils();
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "timeline" | "notes">("overview");

  // Local note text state
  const [internalNoteText, setInternalNoteText] = useState("");
  const [correctionMsgText, setCorrectionMsgText] = useState("");

  // Dialog states
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  // Document Viewer Drawer state
  const [selectedDocForViewer, setSelectedDocForViewer] = useState<any>(null);

  // Queries
  const { data: registration, isLoading } = api.registration.getById.useQuery(
    { id: registrationId },
    { enabled: !!registrationId }
  );

  const { data: documents = [] } = api.document.listForRegistration.useQuery(
    { registrationId },
    { enabled: !!registrationId }
  );

  const { data: timeline = [] } = api.communication.timelineForRegistration.useQuery(
    { registrationId },
    { enabled: !!registrationId }
  );

  const invalidate = () => {
    void utils.registration.getById.invalidate({ id: registrationId });
    void utils.registration.adminList.invalidate();
    void utils.document.listForRegistration.invalidate({ registrationId });
    void utils.communication.timelineForRegistration.invalidate({ registrationId });
  };

  // Mutations
  const approveMutation = api.registration.approve.useMutation({
    onSuccess: () => {
      setApproveDialogOpen(false);
      invalidate();
    },
  });

  const requestCorrectionMutation = api.registration.requestCorrection.useMutation({
    onSuccess: () => {
      setCorrectionDialogOpen(false);
      invalidate();
    },
  });

  const rejectMutation = api.registration.reject.useMutation({
    onSuccess: () => {
      setRejectDialogOpen(false);
      invalidate();
    },
  });

  const addNoteMutation = api.registration.addInternalNote.useMutation({
    onSuccess: () => {
      setInternalNoteText("");
      invalidate();
    },
  });

  const flagRequiresAction = api.document.flagRequiresAction.useMutation({
    onSuccess: () => {
      void utils.document.listForRegistration.invalidate({ registrationId });
    },
  });

  if (isLoading || !registration) {
    return (
      <div className="flex min-h-[450px] items-center justify-center p-8 text-neutral-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
          <span className="text-sm font-medium">Loading Registration Review Workspace…</span>
        </div>
      </div>
    );
  }

  // Camper & Parent Meta
  const camper = registration.camper as any;
  const camperName = camper?.name || "Camper Name";
  const birthDate = camper?.dateOfBirth ? new Date(camper.dateOfBirth) : null;
  const age = birthDate ? new Date().getFullYear() - birthDate.getFullYear() : "13";
  const gender = camper?.gender ? (camper.gender === "MALE" ? "Male" : "Female") : "Female";
  const campusName = registration.campus?.name || "Campus Unassigned";
  const regNumber = registration.registrationNumber || "MYD-00015";
  const regDate = registration.createdAt
    ? new Date(registration.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Jul 19, 2026";

  const parentUser = camper?.user || (registration as any).parent;
  const parentName = parentUser?.firstName
    ? `${parentUser.firstName} ${parentUser.lastName || ""}`
    : parentUser?.name || "Mr. John Iyenoma";
  const parentPhone = parentUser?.phone || "+234 802 123 4567";
  const parentEmail = parentUser?.email || "john.iyenoma@gmail.com";

  // Documents summary
  const requiredDocTitles = ["Birth Certificate", "Parent Consent Form", "Medical Form", "Passport Photograph"];
  const uploadedDocs = documents || [];
  const uploadedCount = uploadedDocs.length;
  const totalRequired = 4;
  const docProgressPercent = Math.min(100, Math.round((uploadedCount / totalRequired) * 100));

  return (
    <div className="relative min-h-screen bg-neutral-50/60 pb-32">
      {/* 1. TOP UTILITY HEADER */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200/80 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700 hover:text-accent-600 transition"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          <span>Back to Registrations</span>
        </button>

        <div className="flex items-center gap-2">
          {onPrevious && (
            <Button variant="secondary" size="sm" onClick={onPrevious}>
              <ChevronLeftIcon className="mr-1 h-3.5 w-3.5" /> Previous
            </Button>
          )}
          {onNext && (
            <Button variant="secondary" size="sm" onClick={onNext}>
              Next <ChevronRightIcon className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
          <button type="button" className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-neutral-100">
            <EllipsisVerticalIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6 space-y-6">
        {/* 2. HEADER CAMPER PROFILE BANNER */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            {/* Left: Avatar + Title */}
            <div className="flex items-start gap-4">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent-100 text-accent-700 font-bold text-xl overflow-hidden border border-accent-200">
                {camper?.photoUrl ? (
                  <img src={camper.photoUrl} alt={camperName} className="h-full w-full object-cover" />
                ) : (
                  <span>{camperName.charAt(0)}</span>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-bold text-neutral-900 tracking-tight">{camperName}</h1>
                  <StatusBadge status={registration.status} />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-neutral-500">
                  <span>{age} Years</span>
                  <span>•</span>
                  <span>{gender}</span>
                  <span>•</span>
                  <span className="font-mono text-neutral-800"># {regNumber}</span>
                  <span>•</span>
                  <span className="text-accent-700">{campusName}</span>
                  <span>•</span>
                  <span>Registered {regDate}</span>
                </div>
              </div>
            </div>

            {/* Right: Parent Info Card */}
            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3.5 min-w-[280px]">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                Parent / Guardian
              </span>
              <div className="font-bold text-neutral-900 text-sm">{parentName}</div>
              <div className="mt-1 space-y-1 text-xs font-medium text-neutral-600">
                <div className="flex items-center gap-2">
                  <PhoneIcon className="h-3.5 w-3.5 text-neutral-400" />
                  <span>{parentPhone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <EnvelopeIcon className="h-3.5 w-3.5 text-neutral-400" />
                  <span>{parentEmail}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. WORKSPACE TABS */}
        <div className="border-b border-neutral-200 flex gap-6 text-sm font-semibold text-neutral-500">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={cn("pb-3 border-b-2 transition", activeTab === "overview" ? "border-accent-600 text-accent-600 font-bold" : "border-transparent hover:text-neutral-900")}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={cn("pb-3 border-b-2 transition flex items-center gap-1.5", activeTab === "documents" ? "border-accent-600 text-accent-600 font-bold" : "border-transparent hover:text-neutral-900")}
          >
            <span>Documents</span>
            <span className="rounded-full bg-accent-100 px-2 py-0.5 text-xs text-accent-700 font-bold">{uploadedCount}/{totalRequired}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            className={cn("pb-3 border-b-2 transition", activeTab === "timeline" ? "border-accent-600 text-accent-600 font-bold" : "border-transparent hover:text-neutral-900")}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("notes")}
            className={cn("pb-3 border-b-2 transition", activeTab === "notes" ? "border-accent-600 text-accent-600 font-bold" : "border-transparent hover:text-neutral-900")}
          >
            Notes
          </button>
        </div>

        {/* 4. MAIN WORKSPACE GRID CONTENT */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* LEFT COLUMN: Camper Info & Registration Info */}
              <div className="space-y-6">
                {/* Camper Info Card */}
                <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs space-y-4">
                  <h3 className="font-bold text-neutral-900 text-base border-b border-neutral-100 pb-3">
                    Camper Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                    <div>
                      <span className="text-neutral-500 font-medium">Date of Birth</span>
                      <p className="font-bold text-neutral-900 mt-0.5">
                        {birthDate ? birthDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "06 May 2013"} ({age} yrs)
                      </p>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Gender</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{gender}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Parent / Guardian</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{parentName}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Phone</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{parentPhone}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-neutral-500 font-medium">Email</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{parentEmail}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-neutral-500 font-medium">Emergency Contact</span>
                      <p className="font-bold text-neutral-900 mt-0.5">
                        {camper?.emergencyContactName || "Mrs. Mary Iyenoma"} ({camper?.emergencyContactPhone || "+234 805 765 4321"})
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-neutral-500 font-medium">Medical Info</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{camper?.medicalNotes || "No known allergies"}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-neutral-500 font-medium">Special Notes</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{camper?.specialNotes || "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Registration Info Card */}
                <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs space-y-4">
                  <h3 className="font-bold text-neutral-900 text-base border-b border-neutral-100 pb-3">
                    Registration Information
                  </h3>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                    <div>
                      <span className="text-neutral-500 font-medium">Camp</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{registration.camp?.name || "JT Camp 2026"}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Campus</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{campusName}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Registration Date</span>
                      <p className="font-bold text-neutral-900 mt-0.5">{regDate}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Source</span>
                      <p className="font-bold text-neutral-900 mt-0.5">Signup Link</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-neutral-500 font-medium">Last Updated</span>
                      <p className="font-bold text-neutral-900 mt-0.5">
                        {new Date(registration.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Uploaded Documents Section */}
              <div className="space-y-6">
                <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                    <h3 className="font-bold text-neutral-900 text-base">Uploaded Documents</h3>
                    <span className="text-xs font-semibold text-neutral-500">{uploadedCount} of {totalRequired} uploaded</span>
                  </div>

                  {/* Document Progress Bar */}
                  <div className="space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          docProgressPercent === 100 ? "bg-emerald-500" : "bg-amber-500"
                        )}
                        style={{ width: `${docProgressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Document Cards List */}
                  <div className="space-y-3 pt-2">
                    {requiredDocTitles.map((docTitle, idx) => {
                      const foundDoc = uploadedDocs.find(
                        (d: any) =>
                          d.requirement?.title?.toLowerCase().includes(docTitle.toLowerCase()) ||
                          d.fileName?.toLowerCase().includes(docTitle.toLowerCase().replace(" ", "_"))
                      ) || uploadedDocs[idx];

                      if (foundDoc) {
                        const isVerified = foundDoc.status === "APPROVED";
                        const isNeedsReview = foundDoc.status === "NEEDS_REVIEW" || foundDoc.status === "PENDING";
                        return (
                          <div
                            key={foundDoc.id}
                            className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white p-3.5 shadow-2xs hover:border-neutral-300 transition"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600 border border-purple-100">
                                <DocumentIcon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-neutral-900 text-xs truncate">{docTitle}</div>
                                <div className="text-[11px] font-mono text-neutral-500 truncate">{foundDoc.fileName}</div>
                                <div className="text-[10px] text-neutral-400">Uploaded Jul 19, 2026 • 2.3 MB</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isVerified ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  <CheckCircleIcon className="h-3 w-3" /> VERIFIED
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                  <ExclamationTriangleIcon className="h-3 w-3" /> NEEDS REVIEW
                                </span>
                              )}

                              <Button
                                variant="secondary"
                                size="sm"
                                className="text-xs px-2.5 py-1"
                                onClick={() => setSelectedDocForViewer({ ...foundDoc, requirementTitle: docTitle })}
                              >
                                Preview
                              </Button>
                              <a
                                href={foundDoc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-neutral-400 hover:text-neutral-800 rounded-lg hover:bg-neutral-100 transition"
                                title="Download Document"
                              >
                                <ArrowDownTrayIcon className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={docTitle}
                          className="flex items-center justify-between rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 p-3.5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
                              <DocumentIcon className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-bold text-neutral-700 text-xs">{docTitle}</div>
                              <div className="text-[11px] text-neutral-400">Not uploaded yet</div>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                            <XCircleIcon className="h-3 w-3" /> MISSING
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. REVIEW NOTES SECTION */}
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs space-y-4">
              <h3 className="font-bold text-neutral-900 text-base border-b border-neutral-100 pb-3">
                Review Notes & Correction Instructions
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Left Textarea: Internal Notes */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                      Internal Notes <span className="font-normal text-neutral-400">(Visible only to admins)</span>
                    </label>
                    <span className="text-[10px] text-neutral-400">{internalNoteText.length}/500</span>
                  </div>
                  <Textarea
                    value={internalNoteText}
                    onChange={(e) => setInternalNoteText(e.target.value)}
                    placeholder="Add private notes about this registration..."
                    rows={4}
                    className="text-xs"
                  />
                  {internalNoteText.trim() && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2 text-xs"
                      loading={addNoteMutation.isPending}
                      onClick={() => addNoteMutation.mutate({ registrationId, text: internalNoteText.trim() })}
                    >
                      Save Internal Note
                    </Button>
                  )}
                </div>

                {/* Right Textarea: Correction Message */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                      Correction Message <span className="font-normal text-neutral-400">(Sent to parent)</span>
                    </label>
                    <span className="text-[10px] text-neutral-400">{correctionMsgText.length}/500</span>
                  </div>
                  <Textarea
                    value={correctionMsgText}
                    onChange={(e) => setCorrectionMsgText(e.target.value)}
                    placeholder="Please upload a signed parental consent form. The uploaded document is incomplete."
                    rows={4}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-neutral-900 text-base border-b border-neutral-100 pb-3">All Documents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uploadedDocs.map((doc: any) => (
                <div key={doc.id} className="rounded-xl border border-neutral-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-neutral-900 truncate">{doc.fileName}</span>
                    <Button size="sm" variant="secondary" onClick={() => setSelectedDocForViewer(doc)}>Preview</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-neutral-900 text-base border-b border-neutral-100 pb-3">Audit Timeline & Activity</h3>
            <AuditTimeline events={timeline ?? []} />
          </div>
        )}

        {activeTab === "notes" && (
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-neutral-900 text-base border-b border-neutral-100 pb-3">Internal Notes History</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {Array.isArray((registration as any).internalNotes) && ((registration as any).internalNotes as any[]).map((n, i) => (
                <div key={i} className="rounded-xl bg-neutral-50 p-3 text-xs border border-neutral-200">
                  <div className="font-medium text-neutral-800">{n.text}</div>
                  <div className="mt-1 text-[10px] text-neutral-400">{new Date(n.at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6. STICKY BOTTOM REVIEW ACTIONS BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-200/80 bg-white/95 px-4 py-3.5 backdrop-blur shadow-2xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          {/* Reject Button */}
          <Button
            className="flex-1 max-w-[200px] border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 justify-center text-sm font-bold"
            onClick={() => setRejectDialogOpen(true)}
          >
            <XMarkIcon className="mr-1.5 h-4 w-4 text-rose-600" />
            Reject
          </Button>

          {/* Request Correction Button */}
          <Button
            className="flex-1 max-w-[240px] border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 justify-center text-sm font-bold"
            onClick={() => setCorrectionDialogOpen(true)}
          >
            <PencilIcon className="mr-1.5 h-4 w-4 text-amber-600" />
            Request Correction
          </Button>

          {/* Approve Button */}
          <Button
            className="flex-1 max-w-[240px] bg-emerald-600 text-white hover:bg-emerald-700 justify-center text-sm font-bold shadow-md shadow-emerald-600/20"
            onClick={() => setApproveDialogOpen(true)}
          >
            <CheckIcon className="mr-1.5 h-4 w-4" />
            Approve
          </Button>
        </div>
      </div>

      {/* DECISION DIALOGS */}
      <ApproveDecisionDialog
        open={approveDialogOpen}
        onClose={() => setApproveDialogOpen(false)}
        camperName={camperName}
        isPending={approveMutation.isPending}
        onConfirm={() => approveMutation.mutate({ registrationId })}
      />

      <RequestCorrectionDecisionDialog
        open={correctionDialogOpen}
        onClose={() => setCorrectionDialogOpen(false)}
        initialMessage={correctionMsgText}
        isPending={requestCorrectionMutation.isPending}
        onConfirm={({ message }) => requestCorrectionMutation.mutate({ registrationId, message })}
      />

      <RejectDecisionDialog
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        isPending={rejectMutation.isPending}
        onConfirm={({ additionalNotes }) => rejectMutation.mutate({ registrationId, reason: additionalNotes })}
      />

      {/* DOCUMENT VIEWER DRAWER */}
      <DocumentViewerDrawer
        isOpen={!!selectedDocForViewer}
        onClose={() => setSelectedDocForViewer(null)}
        document={selectedDocForViewer}
        onRejectDocument={(docId, reason) => {
          if (docId && reason) {
            flagRequiresAction.mutate({ documentId: docId, registrationId, reason });
            setSelectedDocForViewer(null);
          }
        }}
      />
    </div>
  );
}
