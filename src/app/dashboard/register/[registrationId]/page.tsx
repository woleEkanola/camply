"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";

const STATUS_COPY: Record<string, string> = {
  DRAFT: "You haven't submitted this registration yet.",
  SUBMITTED: "We're processing your registration.",
  PENDING: "Your registration is awaiting review by camp administrators.",
  REQUIRES_ACTION: "We need a bit more information from you before we can continue reviewing this registration.",
  APPROVED: "Your registration has been approved! You're ready for camp.",
  REJECTED: "This registration was not approved.",
  WAITLISTED: "This camper is on the waitlist. We'll notify you if a space opens up.",
  CANCELLED: "This registration has been cancelled.",
  CHECKED_IN: "This camper has checked in to camp.",
  COMPLETED: "This camper completed camp.",
  ARCHIVED: "This registration is archived.",
};

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
  const deleteMutation = api.document.delete.useMutation({ onSuccess: onUploaded });

  const doc = existingDocs.find((d) => d.requirementId === requirement.id && d.status !== "REJECTED");
  const acceptedFormats = (requirement.acceptedFormats as string).split(",").map((f) => `.${f.trim()}`).join(",");

  const handleFile = async (file: File) => {
    setLocalError("");
    const maxBytes = requirement.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setLocalError(`File exceeds the maximum size of ${requirement.maxSizeMb} MB.`);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error || "Upload failed.");
        return;
      }
      uploadMutation.mutate({
        requirementId: requirement.id,
        registrationId,
        url: data.url,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 flex items-center justify-between gap-4">
      <div>
        <div className="font-medium">
          {requirement.name} {requirement.required && <span className="text-xs text-red-600">Required</span>}
        </div>
        {requirement.description && <div className="text-sm text-gray-500">{requirement.description}</div>}
        {localError && <div className="text-sm text-red-600 mt-1">{localError}</div>}
      </div>
      <div className="flex-shrink-0">
        {doc ? (
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
          <label className="cursor-pointer bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
            {uploading ? "Uploading..." : "Upload"}
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

  const [step, setStep] = useState<"documents" | "review">("documents");
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [declared, setDeclared] = useState(false);

  const utils = api.useUtils();
  const { data: registration, isLoading, refetch } = api.registration.getById.useQuery(
    { id: registrationId },
    { enabled: !!registrationId }
  );

  const { data: requirements } = api.documentRequirement.listByCamp.useQuery(
    { campId: registration?.campId ?? "" },
    { enabled: !!registration?.campId }
  );

  const { data: documents, refetch: refetchDocs } = api.document.listForRegistration.useQuery(
    { registrationId },
    { enabled: !!registrationId }
  );

  const submitMutation = api.registration.submit.useMutation({
    onSuccess: () => {
      setSubmitErrors([]);
      refetch();
    },
    onError: (e) => {
      // RegistrationValidationError messages are joined with "; " in engine.ts
      setSubmitErrors(e.message.split("; "));
    },
  });

  const resubmitMutation = api.registration.resubmit.useMutation({
    onSuccess: () => {
      setSubmitErrors([]);
      refetch();
    },
    onError: (e) => setSubmitErrors(e.message.split("; ")),
  });

  if (isLoading || !registration) {
    return (
      <AppShell area="dashboard">
        <div className="max-w-2xl mx-auto">Loading...</div>
      </AppShell>
    );
  }

  const missingRequired = (requirements ?? []).filter((req) => {
    if (!req.required) return false;
    return !(documents ?? []).some((d) => d.requirementId === req.id && d.status !== "REJECTED");
  });

  const isEditable = registration.status === "DRAFT" || registration.status === "REQUIRES_ACTION";

  if (!isEditable) {
    return (
      <AppShell area="dashboard">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-xl font-bold mb-2">Registration Status: {registration.status.replace(/_/g, " ")}</h1>
          <p className="text-gray-600 mb-4">{STATUS_COPY[registration.status] ?? ""}</p>
          {registration.registrationNumber && (
            <p className="mb-2"><span className="font-medium">Registration Number:</span> {registration.registrationNumber}</p>
          )}
          {(registration as any).tribe && (
            <p className="mb-2"><span className="font-medium">Tribe:</span> {(registration as any).tribe.name}</p>
          )}
          {registration.rejectionReason && (
            <div className="bg-red-50 text-red-700 p-3 rounded mb-2">Reason: {registration.rejectionReason}</div>
          )}
          {registration.status === "APPROVED" && registration.qrToken && (
            <div className="mt-4 space-y-3">
              <QrPreview registrationId={registration.id} />
              <a
                href={`/api/registrations/${registration.id}/acceptance-letter`}
                target="_blank"
                rel="noreferrer"
                className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Download Acceptance Letter
              </a>
            </div>
          )}
          <button className="mt-4 block text-blue-600 underline" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </button>
        </div>
      </div>
      </AppShell>
    );
  }

  return (
    <AppShell area="dashboard">
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className={step === "documents" ? "font-semibold text-blue-600" : ""}>1. Documents</span>
        <span>→</span>
        <span className={step === "review" ? "font-semibold text-blue-600" : ""}>2. Review & Submit</span>
      </div>

      {registration.status === "REQUIRES_ACTION" && registration.correctionRequest && (
        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg">
          <div className="font-medium mb-1">Action Needed</div>
          <div>{registration.correctionRequest}</div>
        </div>
      )}

      {step === "documents" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Upload Required Documents</h2>
          {(requirements ?? []).map((req) => (
            <DocumentUploader
              key={req.id}
              requirement={req}
              registrationId={registrationId}
              existingDocs={documents ?? []}
              onUploaded={() => refetchDocs()}
            />
          ))}
          {(requirements ?? []).length === 0 && <p className="text-sm text-gray-500">No documents required for this camp.</p>}

          <button
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={missingRequired.length > 0}
            onClick={() => setStep("review")}
          >
            Continue to Review
          </button>
          {missingRequired.length > 0 && (
            <p className="text-sm text-gray-500">Upload all required documents to continue.</p>
          )}
        </div>
      )}

      {step === "review" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Review Your Registration</h2>

          {submitErrors.length > 0 && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg">
              <div className="font-medium mb-1">Please fix the following before submitting:</div>
              <ul className="list-disc list-inside">
                {submitErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Camper:</span> {registration.camper?.name}</div>
            <div><span className="font-medium">Camp:</span> {registration.camp?.name}</div>
            <div><span className="font-medium">Campus:</span> {registration.campus?.name}</div>
            <div><span className="font-medium">Documents:</span> {(documents ?? []).length} uploaded</div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
            I confirm that the information provided is accurate.
          </label>

          <div className="flex gap-2">
            <button className="text-blue-600 underline" onClick={() => setStep("documents")}>
              Back
            </button>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={!declared || submitMutation.isPending || resubmitMutation.isPending}
              onClick={() => {
                if (registration.status === "REQUIRES_ACTION") {
                  resubmitMutation.mutate({ registrationId });
                } else {
                  submitMutation.mutate({ registrationId });
                }
              }}
            >
              {submitMutation.isPending || resubmitMutation.isPending ? "Submitting..." : "Submit Registration"}
            </button>
          </div>
        </div>
      )}

      {(registration.status as string) !== "DRAFT" && (registration.status as string) !== "REQUIRES_ACTION" && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg">
          Your registration has been received successfully. You will receive an email once it has been reviewed.
        </div>
      )}
    </div>
    </AppShell>
  );
}
