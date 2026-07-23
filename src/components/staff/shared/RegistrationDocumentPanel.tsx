"use client";

import { useState, useRef } from "react";
import { api } from "@/utils/trpc";
import { DocumentZoomModal } from "@/components/ui/DocumentZoomModal";
import { MagnifyingGlassPlusIcon } from "@heroicons/react/24/outline";
import { uploadFiles } from "@/utils/uploadthing-hook";
import { compressImage } from "@/lib/compressImage";
import { pickDocumentUploadEndpoint } from "@/lib/uploadEndpoint";

interface Props {
  registrationId: string;
}

type ZoomTarget = { url: string; fileName: string; fileType?: string };

export function RegistrationDocumentPanel({ registrationId }: Props) {
  const { data: documents, refetch } = api.document.listForRegistration.useQuery({ registrationId });
  const [zoomDoc, setZoomDoc] = useState<ZoomTarget | null>(null);

  return (
    <div className="space-y-3">
      <DocumentZoomModal isOpen={!!zoomDoc} onClose={() => setZoomDoc(null)} {...(zoomDoc || { url: "", fileName: "" })} />
      {(documents ?? []).map((doc: any) => (
        <DocumentRow
          key={doc.id}
          doc={doc}
          registrationId={registrationId}
          onChanged={() => refetch()}
          onZoom={setZoomDoc}
        />
      ))}
      {(documents ?? []).length === 0 && <p className="text-sm text-neutral-500">No documents uploaded.</p>}
    </div>
  );
}

function DocumentRow({
  doc,
  registrationId,
  onChanged,
  onZoom,
}: {
  doc: any;
  registrationId: string;
  onChanged: () => void;
  onZoom: (target: ZoomTarget) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);
  const [error, setError] = useState("");
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeAction = doc.documentActions?.[0]?.status === "REQUIRES_ACTION" ? doc.documentActions[0] : null;

  const replaceDocument = api.document.replaceForRegistration.useMutation({
    onSuccess: () => {
      setJustUploaded(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setJustUploaded(false), 4000);
      onChanged();
    },
    onError: (e) => setError(e.message),
  });

  const flagRequiresAction = api.document.flagRequiresAction.useMutation({
    onSuccess: () => onChanged(),
    onError: (e) => setError(e.message),
  });

  const busy = uploading || replaceDocument.isPending;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file still fires onChange.
    e.target.value = "";
    if (!file) return;
    setError("");
    setJustUploaded(false);

    if (!doc.requirement) {
      setError("This document has no linked requirement, so it can't be replaced here.");
      return;
    }
    const requirement = doc.requirement;
    const maxBytes = requirement.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File exceeds the maximum size of ${requirement.maxSizeMb} MB.`);
      return;
    }
    const formats = (requirement.acceptedFormats as string).split(",").map((f: string) => f.trim().toLowerCase());
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (formats.length > 0 && ext && !formats.includes(ext)) {
      setError(`Accepted formats: ${formats.join(", ")}.`);
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressImage(file, maxBytes);
      const res = await uploadFiles(pickDocumentUploadEndpoint(compressed), { files: [compressed] });
      const uploaded = res[0];
      if (!uploaded) {
        setError("Upload failed — no file was returned.");
        return;
      }
      replaceDocument.mutate({
        requirementId: requirement.id,
        registrationId,
        url: (uploaded as any).ufsUrl ?? uploaded.url,
        fileName: uploaded.name,
        fileType: uploaded.type || "application/octet-stream",
        fileSize: uploaded.size,
        replacingDocumentId: doc.id,
      });
    } catch (err: any) {
      setError(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`rounded-md border p-3 text-sm ${activeAction ? "border-warning-300 bg-warning-50" : "border-border-default"}`}>
      <div className="flex items-center justify-between">
        <span className="text-neutral-700 font-medium truncate pr-2">{doc.fileName}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={doc.status === "REJECTED" ? "text-danger-600" : doc.status === "APPROVED" ? "text-success-600" : "text-neutral-500"}>
            {doc.status}
          </span>
          <button
            className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-semibold"
            onClick={() => onZoom({ url: doc.url, fileName: doc.fileName, fileType: doc.fileType })}
          >
            <MagnifyingGlassPlusIcon className="h-3.5 w-3.5" />
            View & Zoom
          </button>
        </div>
      </div>

      {showPreview && (
        <div
          className="mt-3 relative group flex justify-center bg-surface-raised p-2 rounded-md border border-border-default cursor-pointer overflow-hidden"
          onClick={() => onZoom({ url: doc.url, fileName: doc.fileName, fileType: doc.fileType })}
        >
          {doc.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(doc.url || "") ? (
            <img
              src={doc.url}
              alt={doc.fileName}
              className="max-h-85 max-w-full object-contain rounded-md shadow-sm border border-border-default bg-surface group-hover:opacity-90 transition"
            />
          ) : (
            <iframe src={doc.url} className="h-85 w-full rounded-md border border-border-default bg-surface" title={doc.fileName} />
          )}
        </div>
      )}

      {activeAction && (
        <div className="mt-2 text-xs text-warning-800">
          <span className="font-semibold">Action required:</span> {activeAction.reason}
        </div>
      )}

      {uploading && (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          <span className="text-xs font-medium text-accent-600">Uploading…</span>
        </div>
      )}
      {replaceDocument.isPending && !uploading && (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          <span className="text-xs font-medium text-accent-600">Saving replacement…</span>
        </div>
      )}
      {justUploaded && !busy && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Replacement uploaded
        </div>
      )}
      {error && <div className="mt-2 text-xs text-danger-600">{error}</div>}

      <div className="mt-2 flex items-center gap-2">
        <label className={`inline-flex items-center rounded-md bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-100 ${busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
          {uploading ? "Uploading…" : replaceDocument.isPending ? "Saving…" : activeAction ? "Replace Document" : "Upload Replacement"}
          <input type="file" className="hidden" disabled={busy} onChange={handleFile} />
        </label>
        {!activeAction && (
          <button
            className="text-xs text-warning-700 hover:underline"
            onClick={() => {
              const reason = window.prompt("Reason this document needs replacement?") || "";
              if (reason.trim()) {
                flagRequiresAction.mutate({ documentId: doc.id, registrationId, reason: reason.trim() });
              }
            }}
          >
            Request Replacement
          </button>
        )}
        {(doc.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i.test(doc.url || "")) && (
          <button className="text-xs text-neutral-500 hover:underline ml-auto" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
        )}
      </div>
    </div>
  );
}
