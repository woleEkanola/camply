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
  const cameraRef = useRef<HTMLInputElement>(null);

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
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700 hover:bg-accent-100 min-h-[36px]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
            </svg>
            Choose File
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700 hover:bg-accent-100 min-h-[36px]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
            </svg>
            Take Photo
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptedFormatsList}
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
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

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => dispatch({ type: "GO_BACK" })}
          className="flex h-12 flex-1 items-center justify-center rounded-xl border border-neutral-300 bg-white text-base font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          ← Back
        </button>
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
          className="flex h-12 flex-1 items-center justify-center rounded-xl bg-accent-600 text-base font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
        >
          Next
        </button>
      </div>
      <div className="mt-6 text-center">
        <a href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-600 underline">
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
