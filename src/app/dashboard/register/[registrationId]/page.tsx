"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useMemo, useRef } from "react";
import { api } from "@/utils/trpc";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
import type { FormFieldDTO } from "@/components/forms/types";
import { Button } from "@/components/ui/Button";
import { uploadFiles } from "@/utils/uploadthing-hook";
import { compressImage } from "@/lib/compressImage";

const STATUS_COPY: Record<string, string> = {
  DRAFT: "You haven't submitted this registration yet.",
  SUBMITTED: "Your registration is in review.",
  PENDING: "Your registration is in review by camp administrators.",
  REQUIRES_ACTION: "We need a bit more information from you before we can continue reviewing this registration.",
  APPROVED: "Your registration has been approved! You're ready for camp.",
  REJECTED: "This registration was not approved.",
  WAITLISTED: "This camper is on the waitlist. We'll notify you if a space opens up.",
  CANCELLED: "This registration has been cancelled.",
  CHECKED_IN: "This camper has checked in to camp.",
  COMPLETED: "This camper completed camp.",
  ARCHIVED: "This registration is archived.",
};

// Parents see "In Review" instead of the internal "Pending"/"Submitted"
// status names — mirrors the dashboard list's StatusBadge labelOverrides.
const PARENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "In Review",
  SUBMITTED: "In Review",
};

function parentStatusLabel(status: string): string {
  return PARENT_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

function DocumentUploader({
  requirement,
  registrationId,
  existingDocs,
  onUploaded,
}: {
  requirement: any;
  registrationId: string;
  existingDocs: any[];
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const uploadMutation = api.document.upload.useMutation({
    onSuccess: onUploaded,
    onError: (e) => setLocalError(e.message),
  });
  const replaceMutation = api.document.replaceForRegistration.useMutation({
    onSuccess: onUploaded,
    onError: (e) => setLocalError(e.message),
  });
  const deleteMutation = api.document.delete.useMutation({ onSuccess: onUploaded });

  const doc = existingDocs.find((d) => d.requirementId === requirement.id && d.status !== "REJECTED");
  const activeAction = doc?.documentActions?.[0]?.status === "REQUIRES_ACTION" ? doc.documentActions[0] : null;
  const acceptedFormats = (requirement.acceptedFormats as string).split(",").map((f) => `.${f.trim()}`).join(",");

  const handleFile = async (file: File) => {
    setLocalError("");
    const maxBytes = requirement.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setLocalError(`File exceeds the maximum size of ${requirement.maxSizeMb} MB.`);
      return;
    }

    // Validate accepted formats
    const formats = (requirement.acceptedFormats as string).split(",").map((f: string) => f.trim().toLowerCase());
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (formats.length > 0 && ext && !formats.includes(ext)) {
      setLocalError(`Accepted formats: ${formats.join(", ")}.`);
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImage(file, maxBytes);
      const uploaded = await uploadFiles("documentUploader", { files: [compressed] });
      const result = uploaded[0];
      if (!result) {
        setLocalError("Upload failed.");
        return;
      }
      const payload = {
        requirementId: requirement.id,
        registrationId,
        url: result.ufsUrl ?? result.url,
        fileName: result.name,
        fileType: result.type ?? "application/octet-stream",
        fileSize: result.size,
      };
      if (activeAction && doc) {
        replaceMutation.mutate({ ...payload, replacingDocumentId: doc.id });
      } else {
        uploadMutation.mutate(payload);
      }
    } catch (err: any) {
      setLocalError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`rounded-xl border bg-white p-4 flex items-center justify-between gap-4 ${activeAction ? "border-warning-300 bg-warning-50" : "border-neutral-200"}`}>
      <div className="min-w-0">
        <div className="font-medium">
          {requirement.name} {requirement.required && <span className="text-xs text-red-600">Required</span>}
          {activeAction && <span className="ml-2 text-xs font-semibold text-warning-700">Action Required</span>}
        </div>
        {requirement.description && <div className="text-sm text-gray-500">{requirement.description}</div>}
        <div className="text-xs text-gray-400">
          {(requirement.acceptedFormats as string).split(",").map((f: string) => f.trim()).join(" or ")}. Up to {requirement.maxSizeMb} MB
        </div>
        {activeAction && (
          <div className="mt-2 text-sm text-warning-800">
            <span className="font-semibold">Reviewer message:</span> {activeAction.reason}
          </div>
        )}
        {localError && <div className="text-sm text-red-600 mt-1">{localError}</div>}
      </div>
      <div className="flex-shrink-0">
        {doc && !activeAction ? (
          <div className="flex items-center gap-2">
            <span className="text-green-700 text-sm">✓ Uploaded</span>
            <a href={doc.url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm underline">
              Preview
            </a>
            <button className="text-sm text-red-600" onClick={() => deleteMutation.mutate({ id: doc.id })}>
              Remove
            </button>
          </div>
        ) : (
          <label className="cursor-pointer inline-flex items-center rounded-lg bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-100">
            {uploading ? "Uploading..." : activeAction ? "Replace Document" : "Upload"}
            <input
              type="file"
              accept={acceptedFormats}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function QrPreview({ registrationId }: { registrationId: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/registrations/${registrationId}/qr`)
      .then((res) => res.json())
      .then((data) => setDataUrl(data.dataUrl))
      .catch(() => {});
  }, [registrationId]);
  if (!dataUrl) return <div className="text-sm text-gray-500">Loading QR code...</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="Registration QR code" width={160} height={160} />;
}

export default function RegistrationWizardPage() {
  const params = useParams();
  const router = useRouter();
  const registrationId = typeof params.registrationId === "string" ? params.registrationId : "";
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  const [step, setStep] = useState<"profile" | "documents" | "review">("profile");
  
  // Local state for all fields
  const [values, setValues] = useState<Record<string, unknown>>({});
  const syncedRef = useRef(false);
  
  // Validation and API errors
  const [profileErrors, setProfileErrors] = useState<string[]>([]);
  const [documentErrors, setDocumentErrors] = useState<string[]>([]);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [declarationChecks, setDeclarationChecks] = useState<Record<string, boolean>>({});

  const utils = api.useUtils();
  
  // Fetch registration
  const { data: registration, isLoading, refetch } = api.registration.getById.useQuery(
    { id: registrationId },
    { enabled: !!registrationId }
  );

  // Fetch camp document requirements
  const { data: requirements } = api.documentRequirement.listByCamp.useQuery(
    { campId: registration?.campId ?? "" },
    { enabled: !!registration?.campId }
  );

  // Fetch uploaded documents for this registration
  const { data: documents, refetch: refetchDocs } = api.document.listForRegistration.useQuery(
    { registrationId },
    { enabled: !!registrationId }
  );

  // Fetch Camper Form Fields (system + custom)
  const { data: fields = [] } = api.formField.list.useQuery(
    { organizationId: registration?.camper?.organizationId ?? "", audience: "CAMPER" },
    { enabled: !!registration?.camper?.organizationId }
  );

  const visibleFields = useMemo(
    () => fields.filter((f: FormFieldDTO) => f.visible),
    [fields]
  );

  // Fetch admin-configured declarations
  const { data: declarations } = api.registrationConfig.listDeclarations.useQuery(
    { organizationId: registration?.camper?.organizationId ?? "" },
    { enabled: !!registration?.camper?.organizationId }
  );

  // Sync declarations into local state, preserving existing checks
  useEffect(() => {
    if (declarations && declarations.length > 0) {
      setDeclarationChecks((prev) => {
        const next: Record<string, boolean> = {};
        for (const d of declarations) {
          next[d.id] = prev[d.id] ?? false;
        }
        return next;
      });
    }
  }, [declarations]);

  // Sync camper & registration data to local state (once)
  useEffect(() => {
    if (!registration?.camper || syncedRef.current) return;
    syncedRef.current = true;
    const c = registration.camper;
    const initial: Record<string, unknown> = {};
    for (const f of visibleFields) {
      const key = f.source === "SYSTEM" && f.systemKey ? f.systemKey : f.id;
      if (f.source === "SYSTEM" && f.systemKey) {
        const directVal = (c as Record<string, unknown>)[f.systemKey];
        if (directVal !== undefined && directVal !== null) {
          if (f.type === "DATE") {
            if (directVal instanceof Date) {
              initial[key] = directVal.toISOString().split("T")[0];
            } else if (typeof directVal === "string") {
              initial[key] = directVal.split("T")[0];
            } else {
              initial[key] = directVal;
            }
          } else {
            initial[key] = directVal;
          }
        }
      }
    }
    if (c.fieldValues) {
      for (const fv of c.fieldValues) {
        const key = (fv.field?.source === "SYSTEM" && fv.field?.systemKey)
          ? fv.field.systemKey
          : fv.fieldId;
        initial[key] = fv.value;
      }
    }
    setValues(initial);
  }, [registration]);

  // Mutations
  const camperUpdateMutation = api.camper.update.useMutation();

  const submitMutation = api.registration.submit.useMutation({
    onSuccess: () => {
      setSubmitErrors([]);
      refetch();
    },
    onError: (e) => {
      setSubmitErrors(e.message.split("; "));
    },
  });

  const resubmitMutation = api.registration.resubmit.useMutation({
    onSuccess: () => {
      setSubmitErrors([]);
      refetch();
    },
    onError: (e) => {
      setSubmitErrors(e.message.split("; "));
    },
  });

  if (isLoading || !registration) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 font-sans">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          <span className="font-medium text-neutral-500">Loading...</span>
        </div>
      </div>
    );
  }

  const isEditable = registration.status === "DRAFT" || registration.status === "REQUIRES_ACTION";

  if (!isEditable) {
    // ─── colour palette per status ──────────────────────────────────────
    const STATUS_THEME: Record<string, { bg: string; border: string; text: string; pill: string; pillText: string; icon: string }> = {
      APPROVED:        { bg: "bg-emerald-50",  border: "border-emerald-400", text: "text-emerald-900", pill: "bg-emerald-500",  pillText: "text-white", icon: "✅" },
      CHECKED_IN:      { bg: "bg-emerald-50",  border: "border-emerald-400", text: "text-emerald-900", pill: "bg-emerald-600",  pillText: "text-white", icon: "🏕️" },
      COMPLETED:       { bg: "bg-emerald-50",  border: "border-emerald-400", text: "text-emerald-900", pill: "bg-emerald-700",  pillText: "text-white", icon: "🎉" },
      SUBMITTED:       { bg: "bg-blue-50",     border: "border-blue-400",    text: "text-blue-900",    pill: "bg-blue-500",    pillText: "text-white", icon: "📋" },
      PENDING:         { bg: "bg-blue-50",     border: "border-blue-400",    text: "text-blue-900",    pill: "bg-blue-500",    pillText: "text-white", icon: "⏳" },
      WAITLISTED:      { bg: "bg-amber-50",    border: "border-amber-400",   text: "text-amber-900",   pill: "bg-amber-500",   pillText: "text-white", icon: "🕐" },
      REQUIRES_ACTION: { bg: "bg-amber-50",    border: "border-amber-400",   text: "text-amber-900",   pill: "bg-amber-500",   pillText: "text-white", icon: "⚠️" },
      REJECTED:        { bg: "bg-red-50",      border: "border-red-400",     text: "text-red-900",     pill: "bg-red-500",     pillText: "text-white", icon: "❌" },
      CANCELLED:       { bg: "bg-neutral-100", border: "border-neutral-400", text: "text-neutral-700", pill: "bg-neutral-500", pillText: "text-white", icon: "🚫" },
      ARCHIVED:        { bg: "bg-neutral-100", border: "border-neutral-400", text: "text-neutral-700", pill: "bg-neutral-500", pillText: "text-white", icon: "📦" },
    };
    const theme = STATUS_THEME[registration.status] ?? STATUS_THEME["ARCHIVED"]!;
    const statusLabel = parentStatusLabel(registration.status);

    // ─── field value lookup (mirrors wizard Review step logic) ───────────
    const camper = registration.camper as any;
    const fieldEntries = visibleFields.map((f: FormFieldDTO) => {
      const fv = camper?.fieldValues?.find((v: any) => v.fieldId === f.id);
      let val: string = "";
      if (fv?.value) {
        val = fv.value;
      } else if (f.source === "SYSTEM" && f.systemKey) {
        const raw = camper?.[f.systemKey];
        if (raw !== null && raw !== undefined) {
          val = raw instanceof Date ? raw.toISOString().split("T")[0] : String(raw);
        }
      }
      // Pretty-print dates
      if (val && f.type === "DATE") {
        try { val = new Date(val).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" }); } catch {}
      }
      return { label: f.label, value: val, type: f.type };
    }).filter(e => e.value);

    const photoEntry = fieldEntries.find(e => e.type === "FILE" && /photo|picture|headshot|image/i.test(e.label));
    const photoUrl = photoEntry?.value ?? camper?.photoUrl ?? null;
    const displayFields = fieldEntries.filter(e => e.type !== "FILE" || !/photo|picture|headshot|image/i.test(e.label));

    return (
      <div className="min-h-screen bg-neutral-50 font-sans">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 space-y-5">

          {/* ── HUGE STATUS BANNER ──────────────────────────────────────── */}
          <div className={`rounded-2xl border-2 ${theme.border} ${theme.bg} p-6 shadow-sm`}>
            <div className="flex flex-col items-center text-center gap-3">
              <span className="text-5xl">{theme.icon}</span>
              <span className={`inline-flex items-center rounded-full px-5 py-1.5 text-lg font-bold tracking-wide ${theme.pill} ${theme.pillText} shadow`}>
                {statusLabel}
              </span>
              <p className={`text-base font-medium max-w-sm ${theme.text}`}>
                {STATUS_COPY[registration.status] ?? ""}
              </p>
              {registration.registrationNumber && (
                <p className="text-xs font-mono text-neutral-500 bg-white/70 border border-neutral-200 rounded-full px-3 py-1">
                  Reg № {registration.registrationNumber}
                </p>
              )}
            </div>

            {/* Tribe badge */}
            {registration.tribe && (
              <div className="mt-4 flex justify-center">
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold shadow-sm"
                  style={{ borderColor: registration.tribe.color ?? "#E67E22", color: registration.tribe.color ?? "#E67E22", background: `${registration.tribe.color ?? "#E67E22"}18` }}
                >
                  🏳️ {registration.tribe.name}
                </span>
              </div>
            )}

            {/* Rejection reason */}
            {registration.rejectionReason && (
              <div className="mt-4 rounded-xl bg-red-100 border border-red-300 p-3 text-sm text-red-800">
                <span className="font-semibold">Reason: </span>{registration.rejectionReason}
              </div>
            )}

            {/* Correction request */}
            {registration.correctionRequest && (
              <div className="mt-4 rounded-xl bg-amber-100 border border-amber-300 p-3 text-sm text-amber-800">
                <span className="font-semibold">Admin note: </span>{registration.correctionRequest}
              </div>
            )}
          </div>

          {/* ── QR CODE + ACCEPTANCE LETTER (APPROVED only) ───────────── */}
          {registration.status === "APPROVED" && registration.qrToken && (
            <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm p-6 flex flex-col items-center gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Camp Check-In QR Code</p>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl inline-block">
                <QrPreview registrationId={registration.id} />
              </div>
              <a
                href={`/api/registrations/${registration.id}/acceptance-letter`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent-600 px-6 text-sm font-semibold text-white shadow hover:bg-accent-700 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Acceptance Letter
              </a>
            </div>
          )}

          {/* ── CAMPER DETAILS ──────────────────────────────────────────── */}
          <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm overflow-hidden">
            {/* Header row with photo */}
            <div className="flex items-center gap-4 p-5 border-b border-neutral-100 bg-neutral-50">
              <div className="h-16 w-16 shrink-0 rounded-2xl overflow-hidden bg-neutral-200 flex items-center justify-center">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Camper" className="h-full w-full object-cover" />
                ) : (
                  <svg className="h-8 w-8 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-neutral-900">
                  {camper?.firstName ?? ""} {camper?.lastName ?? ""}
                </h2>
                <p className="text-sm text-neutral-500">
                  {registration.camp?.name}
                  {registration.campus?.name ? ` · ${registration.campus.name}` : ""}
                </p>
              </div>
            </div>

            {/* Field grid */}
            {displayFields.length > 0 && (
              <div className="p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Profile Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {displayFields.map(({ label, value }) => (
                    <div key={label} className="min-w-0">
                      <div className="text-xs text-neutral-400 mb-0.5">{label}</div>
                      <div className="text-sm font-semibold text-neutral-900 break-words [overflow-wrap:anywhere]">{value || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── DOCUMENTS ───────────────────────────────────────────────── */}
          {(requirements ?? []).length > 0 && (
            <div className="rounded-2xl bg-white border border-neutral-200 shadow-sm p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Documents</p>
              <div className="space-y-2">
                {(requirements ?? []).map((req: any) => {
                  const doc = (documents ?? []).find((d: any) => d.requirementId === req.id && d.status !== "REJECTED");
                  return (
                    <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
                      <span className="text-sm text-neutral-700 font-medium">{req.name}</span>
                      {doc ? (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-accent-600 underline hover:text-accent-700">
                          View ↗
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs italic text-neutral-400">Not uploaded</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── BACK TO DASHBOARD ───────────────────────────────────────── */}
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full flex h-14 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-white text-base font-bold shadow-lg hover:bg-neutral-800 active:scale-[.98] transition-all"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Dashboard
          </button>

        </div>
      </div>
    );
  }

  // Action handlers
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrors([]);
    setFieldErrors({});

    const errors: string[] = [];
    const fieldsWithErrors: Record<string, string> = {};

    // Validate all visible fields
    for (const f of visibleFields) {
      if (f.required) {
        const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
        const val = values[key];
        if (val === undefined || val === null || String(val).trim() === "" || (Array.isArray(val) && val.length === 0)) {
          errors.push(`${f.label} is required`);
          fieldsWithErrors[key] = "This field is required";
        }
      }
    }

    if (errors.length > 0) {
      setProfileErrors(errors);
      setFieldErrors(fieldsWithErrors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Save profile updates to database
    try {
      const fName = String(values["firstName"] ?? "").trim();
      const mName = String(values["middleName"] ?? "").trim();
      const lName = String(values["lastName"] ?? "").trim();
      const combinedName = `${fName} ${mName} ${lName}`.trim().replace(/\s+/g, ' ');

      await camperUpdateMutation.mutateAsync({
        id: registration.camperId,
        profile: {
          name: combinedName,
          firstName: fName,
          middleName: mName,
          lastName: lName,
          dateOfBirth: values["dateOfBirth"] ? new Date(values["dateOfBirth"] as string).toISOString() : undefined,
          gender: String(values["gender"] ?? ""),
        },
        fieldValues: visibleFields.map((f) => {
          const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
          return {
            fieldId: f.id,
            value: Array.isArray(values[key]) ? JSON.stringify(values[key]) : String(values[key] ?? ""),
          };
        }),
      });


      await refetch();
      setStep("documents");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.startsWith("[") && msg.endsWith("]")) {
        try {
          const parsed = JSON.parse(msg);
          if (Array.isArray(parsed)) {
            setProfileErrors(parsed.map((item: any) => item.message || "Invalid input"));
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }
        } catch {}
      }
      setProfileErrors([msg || "Failed to update camper profile information."]);
    }
  };

  const handleDocumentsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDocumentErrors([]);

    const errors: string[] = [];

    const missingRequired = (requirements ?? []).filter((req) => {
      if (!req.required) return false;
      return !(documents ?? []).some((d) => d.requirementId === req.id && d.status !== "REJECTED");
    });

    for (const req of missingRequired) {
      errors.push(`Document requirement is missing: ${req.name}`);
    }

    if (errors.length > 0) {
      setDocumentErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
      <div className="min-h-screen bg-neutral-50 font-sans">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-6 space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 text-sm font-medium"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-600 text-xs font-bold text-white">1</span><span className="text-neutral-400">→</span><span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-500">2</span><span className="text-neutral-400">→</span><span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-500">3</span></div>

        {registration.status === "REQUIRES_ACTION" && registration.correctionRequest && (
          <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg border border-yellow-200 text-sm">
            <div className="font-semibold mb-1">Correction Requested by Admin</div>
            <div>{registration.correctionRequest}</div>
          </div>
        )}

        {/* STEP 1: PROFILE INFO */}
        {step === "profile" && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 mb-4">Step 1: Camper Profile Info</h2>
              
              {profileErrors.length > 0 && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  <div className="font-semibold mb-1">Please fill in all required fields:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {profileErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <DynamicFieldGroup
                  fields={visibleFields}
                  values={values}
                  onChange={(key, val) => setValues((v) => ({ ...v, [key]: val }))}
                  errors={fieldErrors}
                />

                <div className="flex justify-end pt-4">
                  <button type="submit" className="flex h-11 items-center rounded-xl bg-accent-600 px-5 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50">
                    Continue to Documents
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* STEP 2: DOCUMENTS */}
        {step === "documents" && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 mb-2">Step 2: Required Documents</h2>
              <p className="text-sm text-neutral-500 mb-6">
                Please upload the required identity and parent authorization documents below to proceed.
              </p>

              {documentErrors.length > 0 && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  <div className="font-semibold mb-1">Documents incomplete:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {documentErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <form onSubmit={handleDocumentsSubmit} className="space-y-6">
                {(requirements ?? []).filter(r => r.required).length === 0 ? (
                  <div className="rounded-xl bg-neutral-50 p-6 text-center">
                    <p className="text-sm font-medium text-neutral-700">No documents required</p>
                    <p className="text-xs text-neutral-500">You can continue to review.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(requirements ?? []).map((req) => (
                      <div key={req.id} className={!documents?.some(d => d.requirementId === req.id && d.status !== "REJECTED") && req.required ? "border border-danger-200 rounded-xl" : ""}>
                        <DocumentUploader
                          requirement={req}
                          registrationId={registrationId}
                          existingDocs={documents ?? []}
                          onUploaded={() => refetchDocs()}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between pt-4 border-t">
                  <button type="button" onClick={() => setStep("profile")} className="flex h-11 items-center rounded-xl border border-neutral-300 bg-white px-5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">Back to Profile Info</button>
                  <button type="submit" className="flex h-11 items-center rounded-xl bg-accent-600 px-5 text-sm font-medium text-white transition-colors hover:bg-accent-700">
                    Continue to Review
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & SUBMIT */}
        {step === "review" && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 mb-4">Step 3: Review & Submit</h2>

              {submitErrors.length > 0 && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  <div className="font-semibold mb-1">Please fix the following before submitting:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {submitErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-6">
                {/* 1. Profile Summary */}
                <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-3">
                  <h3 className="font-semibold text-neutral-900 border-b pb-2 text-sm flex justify-between items-center">
                    <span>Camper Profile Information</span>
                    <button className="text-xs text-accent-700 hover:text-accent-800 underline font-normal" onClick={() => setStep("profile")}>Edit</button>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {visibleFields.map((f) => {
                      const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
                      return (
                        <div key={f.id}>
                          <span className="text-neutral-500">{f.label}:</span>{" "}
                          <span className="font-semibold text-neutral-900">
                            {String(values[key] ?? "") || "-"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Documents Summary */}
                <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-3">
                  <h3 className="font-semibold text-neutral-900 border-b pb-2 text-sm flex justify-between items-center">
                    <span>Uploaded Documents</span>
                    <button className="text-xs text-accent-700 hover:text-accent-800 underline font-normal" onClick={() => setStep("documents")}>Edit</button>
                  </h3>
                  <div className="space-y-2 text-sm">
                    {(requirements ?? []).map((req) => {
                      const doc = (documents ?? []).find((d) => d.requirementId === req.id && d.status !== "REJECTED");
                      const activeAction = doc?.documentActions?.[0]?.status === "REQUIRES_ACTION" ? doc.documentActions[0] : null;
                      return (
                        <div key={req.id} className="flex items-center justify-between">
                          <span className="text-neutral-500">{req.name}:</span>
                          {doc ? (
                            <div className="flex items-center gap-2">
                              <a href={doc.url} target="_blank" rel="noreferrer" className="text-accent-700 hover:text-accent-800 underline font-medium">
                                View uploaded document
                              </a>
                              {activeAction && (
                                <span className="text-xs font-medium text-warning-700" title={activeAction.reason}>
                                  Action required
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-400 italic">Not uploaded</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Camp Overview */}
                <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-sm space-y-1">
                  <div>
                    <span className="text-neutral-500">Camp Event:</span>{" "}
                    <span className="font-semibold text-neutral-800">{registration.camp?.name}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Campus Location:</span>{" "}
                    <span className="font-semibold text-neutral-800">{registration.campus?.name}</span>
                  </div>
                </div>

                {/* Declarations */}
                {declarations && declarations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-neutral-900 border-b pb-2 text-sm">Consent</h3>
                    {declarations.map((d) => (
                      <label key={d.id} className="flex items-start gap-2.5 text-sm text-neutral-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={declarationChecks[d.id] ?? false}
                          onChange={(e) =>
                            setDeclarationChecks((prev) => ({ ...prev, [d.id]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 mt-0.5"
                        />
                        <span>
                          {d.label}
                          {d.required && <span className="ml-1 text-xs text-danger-600">(required)</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Navigation and Submit Buttons */}
                <div className="flex justify-between pt-4 border-t">
                  <button type="button" onClick={() => setStep("documents")} className="flex h-11 items-center rounded-xl border border-neutral-300 bg-white px-5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50">Back to Documents</button>
                  <Button
                    type="button"
                    variant="primary"
                    className="w-40"
                    loading={submitMutation.isPending || resubmitMutation.isPending}
                    disabled={(declarations ?? []).filter(d => d.required).some(d => !declarationChecks[d.id])}
                    onClick={() => {
                      if (registration.status === "REQUIRES_ACTION") {
                        resubmitMutation.mutate({ registrationId });
                      } else {
                        submitMutation.mutate({ registrationId });
                      }
                    }}
                  >
                    Submit Registration
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
  );
}
