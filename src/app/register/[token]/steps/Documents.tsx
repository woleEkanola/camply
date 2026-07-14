"use client";

import { useState, useRef } from "react";
import { api } from "@/utils/trpc";
import { uploadFiles } from "@/utils/uploadthing-hook";
import { compressImage } from "@/lib/compressImage";
import type { WizardState, WizardAction } from "../types";
import { TeenSwitcher } from "../components/TeenSwitcher";

interface StepDocumentsProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

function DocumentRow({
  requirement,
  registrationId,
  existingDoc,
  onUploaded,
}: {
  requirement: any;
  registrationId: string;
  existingDoc: any | undefined;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = api.document.upload.useMutation({
    onSuccess: () => {
      onUploaded();
    },
    onError: (e) => {
      setLocalError(e.message);
      setUploading(false);
    },
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = (requirement.maxSizeMb ?? 2) * 1024 * 1024;
    if (file.size > maxBytes) {
      setLocalError(`File exceeds the maximum size of ${requirement.maxSizeMb} MB.`);
      return;
    }

    const acceptedFormats = (requirement.acceptedFormats as string)?.split(",").map((f: string) => f.trim()) ?? [];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (acceptedFormats.length > 0 && ext && !acceptedFormats.includes(ext)) {
      setLocalError(`Accepted formats: ${acceptedFormats.join(", ")}`);
      return;
    }

    setLocalError("");
    setUploading(true);

    try {
      const compressed = await compressImage(file);
      const res = await uploadFiles("documentUploader", {
        files: [compressed],
      });
      const uploaded = res[0];
      if (uploaded) {
        uploadMutation.mutate({
          requirementId: requirement.id,
          registrationId,
          url: uploaded.ufsUrl ?? uploaded.url,
          fileName: uploaded.name,
          fileType: uploaded.type ?? "application/octet-stream",
          fileSize: uploaded.size,
        });
      }
    } catch (err: any) {
      console.error("UploadThing error:", err);
      setLocalError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const acceptedFormatsList = (requirement.acceptedFormats as string)?.split(",").map((f: string) => `.${f.trim()}`).join(",") ?? ".jpg,.png";
  const isDone = !!existingDoc;

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm transition-colors ${
      isDone ? "border-success-300 bg-success-50" : localError ? "border-danger-300" : "border-neutral-200"
    }`}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-900">{requirement.name}</p>
          {requirement.description && <p className="text-xs text-neutral-500">{requirement.description}</p>}
          <p className="mt-0.5 text-xs text-neutral-400">
            {requirement.acceptedFormats?.split(",").map((f: string) => f.trim()).join(" or ")}. Up to {requirement.maxSizeMb} MB
          </p>
        </div>
        {isDone && (
          <svg className="h-5 w-5 shrink-0 text-success-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
      </div>

      {uploading && (
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          <span className="text-xs font-medium text-accent-600">Uploading...</span>
        </div>
      )}

      {localError && <p className="text-xs text-danger-600 mb-2">{localError}</p>}

      {isDone && existingDoc?.fileName && (
        <p className="text-xs text-success-700">
          {existingDoc.fileName}
          {existingDoc.url && (
            <a href={existingDoc.url} target="_blank" rel="noreferrer" className="ml-2 text-accent-600 underline">View</a>
          )}
        </p>
      )}

      {!isDone && !uploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-100"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
          </svg>
          {localError ? "Retry" : "Upload"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptedFormatsList}
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}

export function StepDocuments({ state, dispatch }: StepDocumentsProps) {
  const activeTeen = state.teens.find((t) => t.camperId === state.activeTeenId);

  const { data: requirements } = api.documentRequirement.listByCamp.useQuery(
    { campId: state.campData?.campId ?? "" },
    { enabled: !!state.campData?.campId }
  );

  // Fetch existing documents from the server (survives refresh)
  const { data: existingDocs, refetch: refetchDocs } = api.document.listForRegistration.useQuery(
    { registrationId: activeTeen?.registrationId ?? "" },
    { enabled: !!activeTeen?.registrationId }
  );

  const requiredReqs = requirements?.filter((r) => r.required) ?? [];
  const uploadedReqIds = new Set(
    (existingDocs ?? []).filter((d: any) => d.status !== "REJECTED").map((d: any) => d.requirementId)
  );
  const allRequiredDone = requiredReqs.length === 0 || requiredReqs.every((r) => uploadedReqIds.has(r.id));

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => dispatch({ type: "GO_BACK" })} className="mb-1 text-sm font-medium text-accent-600 hover:text-accent-700">
          ← Back
        </button>
        <TeenSwitcher
          teens={state.teens}
          activeTeenId={state.activeTeenId}
          onChange={(id) => dispatch({ type: "SET_ACTIVE_TEEN", camperId: id })}
        />
        <h1 className="text-xl font-bold text-neutral-900">Documents</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {activeTeen ? `Upload required documents for ${activeTeen.firstName}.` : "Upload required documents."}
        </p>
      </div>

      {!requirements ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-neutral-200" />
          ))}
        </div>
      ) : requiredReqs.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <svg className="mx-auto mb-3 h-10 w-10 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <p className="text-sm font-medium text-neutral-700">No documents required</p>
          <p className="text-xs text-neutral-500">You can continue to review.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requiredReqs.map((req) => (
            <DocumentRow
              key={req.id}
              requirement={req}
              registrationId={activeTeen?.registrationId ?? ""}
              existingDoc={(existingDocs ?? []).find((d: any) => d.requirementId === req.id && d.status !== "REJECTED")}
              onUploaded={() => refetchDocs()}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (activeTeen) {
            dispatch({
              type: "SET_TEEN_COMPLETE",
              camperId: activeTeen.camperId,
              fieldsComplete: activeTeen.fieldsComplete,
              documentsComplete: allRequiredDone,
            });
          }
          dispatch({ type: "GO_TO", step: "REVIEW" });
        }}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-accent-600 text-base font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
      >
        {allRequiredDone ? "Continue to Review" : "Continue to Review (documents pending)"}
      </button>
    </div>
  );
}
